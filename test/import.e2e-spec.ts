import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { hash } from 'argon2';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuthResponseDto } from './../src/auth/dto/auth-response.dto';
import { ImportReportDto } from './../src/import/dto/import.dto';
import { PrismaService } from './../src/prisma/prisma.service';

const MARKER = 'E2E-CSV';
const HEADER =
  'subjectSlug,topicSlug,language,stem,option1,option2,option3,option4,correctOption,explanation,difficulty,sourceType,sourceYear,sourceExam';

// Requires the dev database, freshly seeded (docker compose up -d && pnpm db:seed).
describe('CSV import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let learnerToken: string;
  const runId = Date.now();
  const password = 'correct-horse-battery';

  const server = () => request(app.getHttpServer());
  const upload = (csv: string, token: string) =>
    server()
      .post('/api/admin/import/csv')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv, 'utf8'), 'questions.csv');

  // Two valid rows: Bangla stem with a quoted comma, and an EN past-paper row.
  const validCsv = [
    HEADER,
    `bangla,byakoron,BN,"${MARKER}-${runId} সন্ধি, সমাস ও প্রত্যয় কোন শাখার আলোচ্য?",ধ্বনিতত্ত্ব,রূপতত্ত্ব,বাক্যতত্ত্ব,অর্থতত্ত্ব,2,"${MARKER} রূপতত্ত্বে শব্দগঠন, সন্ধি-সমাস আলোচিত হয়।",MEDIUM,ORIGINAL,,`,
    `english,grammar,EN,${MARKER}-${runId} Choose the correctly punctuated sentence.,"Yes, I will.",Yes I will.,"Yes",I will,1,${MARKER} The comma after Yes is required.,EASY,PAST_PAPER,2018,39th BCS`,
  ].join('\n');

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
        email: `e2e-csv-admin-${runId}@uttirno.test`,
        passwordHash: await hash(password),
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        email: `e2e-csv-learner-${runId}@uttirno.test`,
        passwordHash: await hash(password),
      },
    });
    const adminLogin = await server()
      .post('/api/auth/login')
      .send({ email: `e2e-csv-admin-${runId}@uttirno.test`, password });
    adminToken = (adminLogin.body as AuthResponseDto).accessToken;
    const learnerLogin = await server()
      .post('/api/auth/login')
      .send({ email: `e2e-csv-learner-${runId}@uttirno.test`, password });
    learnerToken = (learnerLogin.body as AuthResponseDto).accessToken;
  });

  afterAll(async () => {
    await prisma.question.deleteMany({
      where: { stem: { contains: MARKER } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-csv-' } },
    });
    await app.close();
  });

  it('requires ADMIN (401 without token, 403 for learner)', async () => {
    await server().post('/api/admin/import/csv').expect(401);
    await upload(validCsv, learnerToken).expect(403);
  });

  it('rejects a missing file and a wrong header (400)', async () => {
    await server()
      .post('/api/admin/import/csv')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await upload('foo,bar\n1,2\n', adminToken).expect(400);
  });

  it('imports valid rows as IN_REVIEW (Bangla + quoted commas intact)', async () => {
    const res = await upload(validCsv, adminToken).expect(200);
    const report = res.body as ImportReportDto;
    expect(report).toMatchObject({
      totalRows: 2,
      imported: 2,
      skippedDuplicates: 0,
      failed: 0,
    });

    const imported = await prisma.question.findMany({
      where: { stem: { contains: `${MARKER}-${runId}` } },
    });
    expect(imported).toHaveLength(2);
    expect(imported.every((q) => q.status === 'IN_REVIEW')).toBe(true);
    expect(imported.every((q) => q.stemHash)).toBeTruthy();

    const bangla = imported.find((q) => q.language === 'BN')!;
    expect(bangla.stem).toContain('সন্ধি, সমাস');
    expect(bangla.correctIndex).toBe(1); // correctOption 2 → 0-based 1
    const en = imported.find((q) => q.language === 'EN')!;
    expect(en.options[0]).toBe('Yes, I will.');
    expect(en.sourceYear).toBe(2018);
  });

  it('re-importing the same file skips every row as duplicate', async () => {
    const res = await upload(validCsv, adminToken).expect(200);
    const report = res.body as ImportReportDto;
    expect(report).toMatchObject({
      totalRows: 2,
      imported: 0,
      skippedDuplicates: 2,
      failed: 0,
    });
  });

  it('reports precise row-level errors and still imports the valid rows', async () => {
    const mixedCsv = [
      HEADER,
      // line 2 — valid
      `bangla,sahitto,BN,${MARKER}-${runId} 'বিদ্রোহী' কবিতাটি কার লেখা?,কাজী নজরুল ইসলাম,রবীন্দ্রনাথ ঠাকুর,জীবনানন্দ দাশ,সুকান্ত ভট্টাচার্য,1,${MARKER} ১৯২১ সালে নজরুলের 'বিদ্রোহী' প্রকাশিত হয়।,EASY,ORIGINAL,,`,
      // line 3 — correctOption out of range
      `bangla,sahitto,BN,${MARKER}-${runId} bad correct,ক,খ,গ,ঘ,5,x,EASY,ORIGINAL,,`,
      // line 4 — PAST_PAPER without provenance
      `english,grammar,EN,${MARKER}-${runId} missing provenance,a,b,c,d,1,x,EASY,PAST_PAPER,,`,
      // line 5 — unknown topic
      `english,no-such-topic,EN,${MARKER}-${runId} bad topic,a,b,c,d,1,x,EASY,ORIGINAL,,`,
    ].join('\n');

    const res = await upload(mixedCsv, adminToken).expect(200);
    const report = res.body as ImportReportDto;
    expect(report).toMatchObject({
      totalRows: 4,
      imported: 1,
      skippedDuplicates: 0,
      failed: 3,
    });
    const errorRows = report.rowErrors.map((e) => e.row).sort();
    expect(errorRows).toEqual([3, 4, 5]);
    const provenanceError = report.rowErrors.find((e) => e.row === 4)!;
    expect(JSON.stringify(provenanceError.errors)).toContain('sourceYear');
  });

  it('imported IN_REVIEW rows do not appear in the public list', async () => {
    const res = await server().get('/api/questions?pageSize=100').expect(200);
    expect(JSON.stringify(res.body)).not.toContain(MARKER);
  });
});
