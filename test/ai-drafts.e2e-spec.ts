import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { hash } from 'argon2';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuthResponseDto } from './../src/auth/dto/auth-response.dto';
import { AiClient } from './../src/import/ai-client';
import { AiDraftReportDto } from './../src/import/dto/import.dto';
import { PrismaService } from './../src/prisma/prisma.service';

const MARKER = 'E2E-AI';

type FakeMode = 'ok' | 'garbage' | 'unconfigured';

class FakeAiClient {
  mode: FakeMode = 'ok';
  payload = '[]';

  generateDrafts(): Promise<string> {
    if (this.mode === 'unconfigured') {
      return Promise.reject(
        new ServiceUnavailableException(
          'AI drafting is not configured — set ANTHROPIC_API_KEY',
        ),
      );
    }
    if (this.mode === 'garbage') {
      return Promise.resolve('Sure! Here are some questions for you...');
    }
    return Promise.resolve(this.payload);
  }
}

// Requires the dev database, freshly seeded (docker compose up -d && pnpm db:seed).
describe('AI drafts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let learnerToken: string;
  let topicId: string;
  const fake = new FakeAiClient();
  const runId = Date.now();
  const password = 'correct-horse-battery';

  const server = () => request(app.getHttpServer());
  const generate = (token: string, body: object) =>
    server()
      .post('/api/admin/import/ai-drafts')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const validDraftsJson = JSON.stringify([
    {
      stem: `${MARKER}-${runId} 'পথের পাঁচালী' উপন্যাসের রচয়িতা কে?`,
      options: [
        'বিভূতিভূষণ বন্দ্যোপাধ্যায়',
        'মানিক বন্দ্যোপাধ্যায়',
        'তারাশঙ্কর বন্দ্যোপাধ্যায়',
        'শরৎচন্দ্র চট্টোপাধ্যায়',
      ],
      correctIndex: 0,
      explanation: `${MARKER} 'পথের পাঁচালী' (১৯২৯) বিভূতিভূষণ বন্দ্যোপাধ্যায়ের কালজয়ী উপন্যাস।`,
    },
    {
      stem: `${MARKER}-${runId} 'গীতাঞ্জলি' কাব্যগ্রন্থের ইংরেজি অনুবাদ কে করেন?`,
      options: [
        'রবীন্দ্রনাথ ঠাকুর নিজে',
        'উইলিয়াম রাদিচে',
        'বুদ্ধদেব বসু',
        'সৈয়দ মুজতবা আলী',
      ],
      correctIndex: 0,
      explanation: `${MARKER} 'Song Offerings' রবীন্দ্রনাথের নিজের করা অনুবাদ, যার জন্য তিনি নোবেল পান।`,
    },
  ]);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AiClient)
      .useValue(fake)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, 'http://localhost:4200');
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.create({
      data: {
        email: `e2e-ai-admin-${runId}@uttirno.test`,
        passwordHash: await hash(password),
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        email: `e2e-ai-learner-${runId}@uttirno.test`,
        passwordHash: await hash(password),
      },
    });
    const adminLogin = await server()
      .post('/api/auth/login')
      .send({ email: `e2e-ai-admin-${runId}@uttirno.test`, password });
    adminToken = (adminLogin.body as AuthResponseDto).accessToken;
    const learnerLogin = await server()
      .post('/api/auth/login')
      .send({ email: `e2e-ai-learner-${runId}@uttirno.test`, password });
    learnerToken = (learnerLogin.body as AuthResponseDto).accessToken;

    const topic = await prisma.topic.findFirst({ where: { slug: 'sahitto' } });
    topicId = topic!.id;
  });

  afterAll(async () => {
    await prisma.question.deleteMany({ where: { stem: { contains: MARKER } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'e2e-ai-' } } });
    await app.close();
  });

  beforeEach(() => {
    fake.mode = 'ok';
    fake.payload = validDraftsJson;
  });

  it('requires ADMIN (401/403)', async () => {
    await server()
      .post('/api/admin/import/ai-drafts')
      .send({ topicId, language: 'BN' })
      .expect(401);
    await generate(learnerToken, { topicId, language: 'BN' }).expect(403);
  });

  it('rejects invalid bodies (400)', async () => {
    await generate(adminToken, { topicId, count: 50, language: 'BN' }).expect(
      400,
    );
    await generate(adminToken, { language: 'BN' }).expect(400);
    await generate(adminToken, {
      topicId: 'no-such-topic',
      language: 'BN',
    }).expect(400);
  });

  it('creates drafts as AI_GENERATED + IN_REVIEW — never published, never public', async () => {
    const res = await generate(adminToken, {
      topicId,
      count: 2,
      language: 'BN',
    }).expect(200);
    const report = res.body as AiDraftReportDto;
    expect(report).toMatchObject({
      requested: 2,
      created: 2,
      skippedDuplicates: 0,
      failed: 0,
    });
    expect(report.drafts).toHaveLength(2);
    expect(
      report.drafts.every(
        (d) => d.sourceType === 'AI_GENERATED' && d.status === 'IN_REVIEW',
      ),
    ).toBe(true);

    const publicList = await server()
      .get('/api/questions?pageSize=100')
      .expect(200);
    expect(JSON.stringify(publicList.body)).not.toContain(MARKER);
  });

  it('dedupes repeated drafts by stem hash', async () => {
    const res = await generate(adminToken, {
      topicId,
      count: 2,
      language: 'BN',
    }).expect(200);
    const report = res.body as AiDraftReportDto;
    expect(report).toMatchObject({ created: 0, skippedDuplicates: 2 });
  });

  it('handles fenced JSON output', async () => {
    fake.payload =
      '```json\n' +
      JSON.stringify([
        {
          stem: `${MARKER}-${runId} fenced output question?`,
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 2,
          explanation: `${MARKER} fenced.`,
        },
      ]) +
      '\n```';
    const res = await generate(adminToken, {
      topicId,
      count: 1,
      language: 'EN',
    }).expect(200);
    expect((res.body as AiDraftReportDto).created).toBe(1);
  });

  it('maps garbage model output to 502', async () => {
    fake.mode = 'garbage';
    await generate(adminToken, { topicId, count: 2, language: 'BN' }).expect(
      502,
    );
  });

  it('maps a missing API key to 503', async () => {
    fake.mode = 'unconfigured';
    await generate(adminToken, { topicId, count: 2, language: 'BN' }).expect(
      503,
    );
  });
});
