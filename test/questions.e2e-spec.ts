import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { hash } from 'argon2';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuthResponseDto } from './../src/auth/dto/auth-response.dto';
import {
  AdminQuestionDto,
  PublicQuestionListDto,
} from './../src/questions/dto/question.dto';
import { PrismaService } from './../src/prisma/prisma.service';

const STEM_MARKER = 'E2E-QUESTIONS-SPEC';

// Requires the dev database, freshly seeded (docker compose up -d && pnpm db:seed).
describe('Questions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let learnerToken: string;
  let topicId: string;
  const runId = Date.now();
  const password = 'correct-horse-battery';

  const server = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, 'http://localhost:4200');
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email: `e2e-q-admin-${runId}@uttirno.test`,
        passwordHash: await hash(password),
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        email: `e2e-q-learner-${runId}@uttirno.test`,
        passwordHash: await hash(password),
        role: 'LEARNER',
      },
    });
    const adminLogin = await server()
      .post('/api/auth/login')
      .send({ email: `e2e-q-admin-${runId}@uttirno.test`, password });
    adminToken = (adminLogin.body as AuthResponseDto).accessToken;
    const learnerLogin = await server()
      .post('/api/auth/login')
      .send({ email: `e2e-q-learner-${runId}@uttirno.test`, password });
    learnerToken = (learnerLogin.body as AuthResponseDto).accessToken;

    const topic = await prisma.topic.findFirst({
      where: { slug: 'byakoron' },
    });
    topicId = topic!.id;
  });

  afterAll(async () => {
    await prisma.question.deleteMany({
      where: { stem: { contains: STEM_MARKER } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `e2e-q-` } },
    });
    await app.close();
  });

  const validQuestion = (overrides: Record<string, unknown> = {}) => ({
    topicId,
    stem: `${STEM_MARKER} কোন বানানটি শুদ্ধ?`,
    options: ['মুমূর্ষু', 'মুমুর্ষু', 'মূমুর্ষু', 'মুমূর্ষূ'],
    correctIndex: 0,
    explanation: `${STEM_MARKER} শুদ্ধ বানান 'মুমূর্ষু'।`,
    sourceType: 'ORIGINAL',
    language: 'BN',
    ...overrides,
  });

  describe('public list — the answer-hiding guardrail', () => {
    it('never serializes correctIndex or explanation', async () => {
      const res = await server().get('/api/questions?pageSize=100').expect(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('correctIndex');
      expect(raw).not.toContain('explanation');
      const body = res.body as PublicQuestionListDto;
      expect(body.total).toBeGreaterThan(0);
      expect(body.items.every((q) => q.options.length === 4)).toBe(true);
    });

    it('returns only PUBLISHED questions (seed: 8 of 10)', async () => {
      const res = await server().get('/api/questions?pageSize=100').expect(200);
      const body = res.body as PublicQuestionListDto;
      // Seed has 10 questions: 8 PUBLISHED, 1 DRAFT, 1 IN_REVIEW.
      expect(body.total).toBe(8);
    });

    it('filters by subject slug', async () => {
      const res = await server()
        .get('/api/questions?subject=bangla')
        .expect(200);
      const body = res.body as PublicQuestionListDto;
      expect(body.total).toBe(3);
      expect(body.items.every((q) => q.topic.subject.slug === 'bangla')).toBe(
        true,
      );
    });

    it('filters by year — the "৩৫তম বিসিএস" use case', async () => {
      const res = await server().get('/api/questions?year=2015').expect(200);
      const body = res.body as PublicQuestionListDto;
      expect(body.total).toBe(1);
      expect(body.items[0].sourceExam).toBe('৩৫তম বিসিএস');
    });

    it('paginates', async () => {
      const res = await server()
        .get('/api/questions?page=1&pageSize=3')
        .expect(200);
      const body = res.body as PublicQuestionListDto;
      expect(body.items.length).toBe(3);
      expect(body.total).toBe(8);
    });

    it('rejects an invalid query with 400', () => {
      return server().get('/api/questions?pageSize=999').expect(400);
    });
  });

  describe('admin CRUD — auth', () => {
    it('401 without token', () => {
      return server().get('/api/admin/questions').expect(401);
    });

    it('403 for LEARNER', () => {
      return server()
        .get('/api/admin/questions')
        .set('Authorization', `Bearer ${learnerToken}`)
        .expect(403);
    });
  });

  describe('admin CRUD — invariants', () => {
    it('rejects PAST_PAPER without provenance (400)', () => {
      return server()
        .post('/api/admin/questions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validQuestion({ sourceType: 'PAST_PAPER' }))
        .expect(400);
    });

    it('rejects AI_GENERATED created as PUBLISHED (400)', () => {
      return server()
        .post('/api/admin/questions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validQuestion({ sourceType: 'AI_GENERATED', status: 'PUBLISHED' }),
        )
        .expect(400);
    });

    it('rejects correctIndex out of range (400)', () => {
      return server()
        .post('/api/admin/questions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validQuestion({ correctIndex: 4 }))
        .expect(400);
    });

    it('rejects a non-4-option question (400)', () => {
      return server()
        .post('/api/admin/questions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validQuestion({ options: ['ক', 'খ'] }))
        .expect(400);
    });

    it('rejects an unknown topicId (400)', () => {
      return server()
        .post('/api/admin/questions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validQuestion({ topicId: 'no-such-topic' }))
        .expect(400);
    });
  });

  describe('admin CRUD — lifecycle', () => {
    let created: AdminQuestionDto;

    it('creates a DRAFT question (201, includes answer key for admin)', async () => {
      const res = await server()
        .post('/api/admin/questions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validQuestion())
        .expect(201);
      created = res.body as AdminQuestionDto;
      expect(created.correctIndex).toBe(0);
      expect(created.status).toBe('DRAFT');
      expect(created.topic.slug).toBe('byakoron');
    });

    it('a DRAFT question does not appear in the public list', async () => {
      const res = await server().get('/api/questions?pageSize=100').expect(200);
      const body = res.body as PublicQuestionListDto;
      expect(body.items.some((q) => q.id === created.id)).toBe(false);
    });

    it('updates the stem (200)', async () => {
      const res = await server()
        .patch(`/api/admin/questions/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stem: `${STEM_MARKER} updated stem` })
        .expect(200);
      expect((res.body as AdminQuestionDto).stem).toContain('updated stem');
    });

    it('rejects an update that breaks invariants on the merged entity (400)', () => {
      // Existing question is ORIGINAL with no provenance — switching to
      // PAST_PAPER without also sending sourceYear/sourceExam must fail.
      return server()
        .patch(`/api/admin/questions/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sourceType: 'PAST_PAPER' })
        .expect(400);
    });

    it('gets the detail (200) and 404 for unknown id', async () => {
      await server()
        .get(`/api/admin/questions/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await server()
        .get('/api/admin/questions/no-such-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('deletes (204) and then 404s', async () => {
      await server()
        .delete(`/api/admin/questions/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
      await server()
        .get(`/api/admin/questions/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
