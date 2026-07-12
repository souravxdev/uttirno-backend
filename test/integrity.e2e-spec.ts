import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuthResponseDto } from './../src/auth/dto/auth-response.dto';
import { SessionPlayStateDto } from './../src/quiz-sessions/dto/session.dto';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * THE integrity guardrail (roadmap Phase 1, Session 4): correctIndex and
 * explanation must never appear in ANY response a learner can reach before
 * submitting a session. Every learner-facing surface is swept here; add new
 * endpoints to this list as they appear.
 */
describe('Answer-leak integrity sweep (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  const runId = Date.now();
  const email = `e2e-integrity-${runId}@uttirno.test`;
  const password = 'correct-horse-battery';

  const server = () => request(app.getHttpServer());

  function assertNoLeak(surface: string, payload: unknown): void {
    const raw = JSON.stringify(payload);
    expect(`${surface}: ${raw}`).not.toContain('correctIndex');
    expect(`${surface}: ${raw}`).not.toContain('explanation');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, 'http://localhost:4200');
    await app.init();
    prisma = app.get(PrismaService);

    const registered = await server()
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    token = (registered.body as AuthResponseDto).accessToken;
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.quizSession.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  it('sweeps every pre-submission surface', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    // Public browsing surfaces
    const questions = await server()
      .get('/api/questions?pageSize=100')
      .expect(200);
    assertNoLeak('GET /questions', questions.body);

    const tree = await server().get('/api/taxonomy/tree').expect(200);
    assertNoLeak('GET /taxonomy/tree', tree.body);

    // Auth surface
    const me = await server().get('/api/auth/me').set(auth).expect(200);
    assertNoLeak('GET /auth/me', me.body);

    // The full in-exam lifecycle
    const created = await server()
      .post('/api/sessions')
      .set(auth)
      .send({ questionCount: 4, timeLimitSec: 300 })
      .expect(201);
    assertNoLeak('POST /sessions', created.body);
    const id = (created.body as { id: string }).id;

    const summaryCreated = await server()
      .get(`/api/sessions/${id}`)
      .set(auth)
      .expect(200);
    assertNoLeak('GET /sessions/:id (CREATED)', summaryCreated.body);

    const started = await server()
      .post(`/api/sessions/${id}/start`)
      .set(auth)
      .expect(200);
    assertNoLeak('POST /sessions/:id/start', started.body);
    const firstQuestion = (started.body as SessionPlayStateDto).questions[0];

    const play = await server()
      .get(`/api/sessions/${id}/play`)
      .set(auth)
      .expect(200);
    assertNoLeak('GET /sessions/:id/play', play.body);

    const saved = await server()
      .patch(`/api/sessions/${id}/answers`)
      .set(auth)
      .send({ questionId: firstQuestion.questionId, selectedIndex: 1 })
      .expect(200);
    assertNoLeak('PATCH /sessions/:id/answers', saved.body);

    const summaryInProgress = await server()
      .get(`/api/sessions/${id}`)
      .set(auth)
      .expect(200);
    assertNoLeak('GET /sessions/:id (IN_PROGRESS)', summaryInProgress.body);

    const history = await server().get('/api/sessions').set(auth).expect(200);
    assertNoLeak('GET /sessions (history)', history.body);

    // Error payloads must not leak either
    const conflict = await server()
      .get(`/api/sessions/${id}/result`)
      .set(auth)
      .expect(409);
    assertNoLeak('GET /sessions/:id/result (pre-submit 409)', conflict.body);
  });
});
