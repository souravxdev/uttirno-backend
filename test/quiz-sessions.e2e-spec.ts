import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { hash } from 'argon2';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuthResponseDto } from './../src/auth/dto/auth-response.dto';
import {
  SessionPlayStateDto,
  SessionResultDto,
  SessionSummaryDto,
} from './../src/quiz-sessions/dto/session.dto';
import { PrismaService } from './../src/prisma/prisma.service';

// Requires the dev database, freshly seeded (docker compose up -d && pnpm db:seed).
describe('Quiz sessions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  const runId = Date.now();
  const password = 'correct-horse-battery';

  const server = () => request(app.getHttpServer());
  const auth = (t: string) => `Bearer ${t}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, 'http://localhost:4200');
    await app.init();
    prisma = app.get(PrismaService);

    for (const email of [
      `e2e-s-user-${runId}@uttirno.test`,
      `e2e-s-other-${runId}@uttirno.test`,
    ]) {
      await prisma.user.create({
        data: { email, passwordHash: await hash(password) },
      });
    }
    const login = await server()
      .post('/api/auth/login')
      .send({ email: `e2e-s-user-${runId}@uttirno.test`, password });
    token = (login.body as AuthResponseDto).accessToken;
    const otherLogin = await server()
      .post('/api/auth/login')
      .send({ email: `e2e-s-other-${runId}@uttirno.test`, password });
    otherToken = (otherLogin.body as AuthResponseDto).accessToken;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'e2e-s-' } },
      select: { id: true },
    });
    await prisma.quizSession.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: 'e2e-s-' } } });
    await app.close();
  });

  /** Creates + starts a session and returns its play state. */
  async function startSession(
    questionCount: number,
    timeLimitSec = 300,
  ): Promise<SessionPlayStateDto> {
    const created = await server()
      .post('/api/sessions')
      .set('Authorization', auth(token))
      .send({ questionCount, timeLimitSec })
      .expect(201);
    const summary = created.body as SessionSummaryDto;
    expect(summary.status).toBe('CREATED');
    expect(summary.startedAt).toBeNull();

    const started = await server()
      .post(`/api/sessions/${summary.id}/start`)
      .set('Authorization', auth(token))
      .expect(200);
    return started.body as SessionPlayStateDto;
  }

  async function correctIndexOf(questionId: string): Promise<number> {
    const q = await prisma.question.findUnique({
      where: { id: questionId },
      select: { correctIndex: true },
    });
    return q!.correctIndex;
  }

  it('requires auth on every route', async () => {
    await server().post('/api/sessions').send({}).expect(401);
    await server().get('/api/sessions').expect(401);
  });

  it('rejects a config the bank cannot satisfy (400)', () => {
    // Seed has 8 PUBLISHED questions total.
    return server()
      .post('/api/sessions')
      .set('Authorization', auth(token))
      .send({ questionCount: 50, timeLimitSec: 600 })
      .expect(400);
  });

  it('respects the subjects filter bounds (bangla has 3 published)', async () => {
    await server()
      .post('/api/sessions')
      .set('Authorization', auth(token))
      .send({ questionCount: 3, timeLimitSec: 300, subjects: ['bangla'] })
      .expect(201);
    await server()
      .post('/api/sessions')
      .set('Authorization', auth(token))
      .send({ questionCount: 4, timeLimitSec: 300, subjects: ['bangla'] })
      .expect(400);
  });

  it('respects the topics filter (practice mode)', async () => {
    const created = await server()
      .post('/api/sessions')
      .set('Authorization', auth(token))
      .send({ questionCount: 1, timeLimitSec: 300, topics: ['byakoron'] })
      .expect(201);
    const id = (created.body as SessionSummaryDto).id;

    const answers = await prisma.answer.findMany({
      where: { sessionId: id },
      select: {
        question: { select: { topic: { select: { slug: true } } } },
      },
    });
    expect(answers).toHaveLength(1);
    expect(answers[0].question.topic.slug).toBe('byakoron');

    // byakoron has a single PUBLISHED question in the seed.
    await server()
      .post('/api/sessions')
      .set('Authorization', auth(token))
      .send({ questionCount: 5, timeLimitSec: 300, topics: ['byakoron'] })
      .expect(400);
  });

  it('never leaks correctIndex or explanation before submission', async () => {
    const play = await startSession(4);
    const raw = JSON.stringify(play);
    expect(raw).not.toContain('correctIndex');
    expect(raw).not.toContain('explanation');
    expect(play.questions).toHaveLength(4);
    expect(play.questions.map((q) => q.order)).toEqual([0, 1, 2, 3]);
    expect(play.remainingSec).toBeGreaterThan(0);
    expect(play.remainingSec).toBeLessThanOrEqual(300);
  });

  it('runs the full mock exam: save, resume, submit, exact score', async () => {
    const play = await startSession(4);
    const [q0, q1, q2, q3] = play.questions;

    // 2 correct, 1 wrong, 1 skipped → 2·1 − 1·0.5 = 1.5
    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({
        questionId: q0.questionId,
        selectedIndex: await correctIndexOf(q0.questionId),
        timeTakenSec: 12,
      })
      .expect(200);
    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({
        questionId: q1.questionId,
        selectedIndex: await correctIndexOf(q1.questionId),
      })
      .expect(200);
    const wrongIndex = ((await correctIndexOf(q2.questionId)) + 1) % 4;
    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({ questionId: q2.questionId, selectedIndex: wrongIndex })
      .expect(200);
    void q3; // deliberately skipped

    // Resume: saved selections come back, still no answer leak.
    const resumed = await server()
      .get(`/api/sessions/${play.id}/play`)
      .set('Authorization', auth(token))
      .expect(200);
    const resumedPlay = resumed.body as SessionPlayStateDto;
    expect(
      resumedPlay.questions.find((q) => q.questionId === q0.questionId)!
        .selectedIndex,
    ).toBe(await correctIndexOf(q0.questionId));
    expect(JSON.stringify(resumedPlay)).not.toContain('explanation');

    // Result before submission is refused — the integrity rule.
    await server()
      .get(`/api/sessions/${play.id}/result`)
      .set('Authorization', auth(token))
      .expect(409);

    const submitted = await server()
      .post(`/api/sessions/${play.id}/submit`)
      .set('Authorization', auth(token))
      .expect(200);
    const result = submitted.body as SessionResultDto;
    expect(result.status).toBe('SUBMITTED');
    expect(result.totals).toEqual({
      correct: 2,
      wrong: 1,
      skipped: 1,
      positiveMarks: 2,
      negativeMarks: 0.5,
      score: 1.5,
    });
    // Now (and only now) the answers are revealed.
    expect(result.items).toHaveLength(4);
    expect(result.items.every((i) => typeof i.correctIndex === 'number')).toBe(
      true,
    );
    expect(result.items.every((i) => i.explanation.length > 0)).toBe(true);

    // Subject-wise breakdown must reconcile with the totals.
    const breakdownSums = result.subjectBreakdown.reduce(
      (acc, s) => ({
        correct: acc.correct + s.correct,
        wrong: acc.wrong + s.wrong,
        skipped: acc.skipped + s.skipped,
        score: acc.score + s.score,
      }),
      { correct: 0, wrong: 0, skipped: 0, score: 0 },
    );
    expect(breakdownSums).toEqual({
      correct: 2,
      wrong: 1,
      skipped: 1,
      score: 1.5,
    });

    // Double submit → 409; further saves → 409.
    await server()
      .post(`/api/sessions/${play.id}/submit`)
      .set('Authorization', auth(token))
      .expect(409);
    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({ questionId: q3.questionId, selectedIndex: 0 })
      .expect(409);

    // History shows the attempt with the score.
    const history = await server()
      .get('/api/sessions')
      .set('Authorization', auth(token))
      .expect(200);
    const items = (history.body as { items: SessionSummaryDto[] }).items;
    const entry = items.find((s) => s.id === play.id)!;
    expect(entry.status).toBe('SUBMITTED');
    expect(entry.score).toBe(1.5);
  });

  it('persists flag-for-review and never clobbers the saved selection', async () => {
    const play = await startSession(3);
    const [q0] = play.questions;
    const chosen = await correctIndexOf(q0.questionId);

    // Save a selection first.
    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({ questionId: q0.questionId, selectedIndex: chosen })
      .expect(200);

    // Flag-only save: no selectedIndex in the body.
    const flagged = await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({ questionId: q0.questionId, flagged: true })
      .expect(200);
    // The ack echoes the untouched selection and the new flag.
    expect(
      (flagged.body as { selectedIndex: number | null }).selectedIndex,
    ).toBe(chosen);
    expect((flagged.body as { flagged: boolean }).flagged).toBe(true);

    // Resume shows both the selection and the flag.
    const resumed = await server()
      .get(`/api/sessions/${play.id}/play`)
      .set('Authorization', auth(token))
      .expect(200);
    const q0After = (resumed.body as SessionPlayStateDto).questions.find(
      (q) => q.questionId === q0.questionId,
    )!;
    expect(q0After.selectedIndex).toBe(chosen);
    expect(q0After.flagged).toBe(true);

    // Unflagging leaves the selection intact.
    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({ questionId: q0.questionId, flagged: false })
      .expect(200);
    const resumed2 = await server()
      .get(`/api/sessions/${play.id}/play`)
      .set('Authorization', auth(token))
      .expect(200);
    const q0Final = (resumed2.body as SessionPlayStateDto).questions.find(
      (q) => q.questionId === q0.questionId,
    )!;
    expect(q0Final.selectedIndex).toBe(chosen);
    expect(q0Final.flagged).toBe(false);
  });

  it('guards the state machine (double start, unstarted submit/save)', async () => {
    const created = await server()
      .post('/api/sessions')
      .set('Authorization', auth(token))
      .send({ questionCount: 2, timeLimitSec: 300 })
      .expect(201);
    const id = (created.body as SessionSummaryDto).id;

    await server()
      .post(`/api/sessions/${id}/submit`)
      .set('Authorization', auth(token))
      .expect(409);
    await server()
      .post(`/api/sessions/${id}/start`)
      .set('Authorization', auth(token))
      .expect(200);
    await server()
      .post(`/api/sessions/${id}/start`)
      .set('Authorization', auth(token))
      .expect(409);
  });

  it('hides foreign sessions (404) and rejects foreign questions (400)', async () => {
    const play = await startSession(2);
    await server()
      .get(`/api/sessions/${play.id}`)
      .set('Authorization', auth(otherToken))
      .expect(404);
    await server()
      .post(`/api/sessions/${play.id}/submit`)
      .set('Authorization', auth(otherToken))
      .expect(404);
    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({ questionId: 'not-in-this-session', selectedIndex: 0 })
      .expect(400);
  });

  it('auto-expires an overdue session and scores the saved answers', async () => {
    const play = await startSession(2, 300);
    const [q0] = play.questions;
    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({
        questionId: q0.questionId,
        selectedIndex: await correctIndexOf(q0.questionId),
      })
      .expect(200);

    // Simulate the clock running out (no waiting in tests).
    await prisma.quizSession.update({
      where: { id: play.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const summary = await server()
      .get(`/api/sessions/${play.id}`)
      .set('Authorization', auth(token))
      .expect(200);
    expect((summary.body as SessionSummaryDto).status).toBe('EXPIRED');
    expect((summary.body as SessionSummaryDto).score).toBe(1);

    await server()
      .patch(`/api/sessions/${play.id}/answers`)
      .set('Authorization', auth(token))
      .send({ questionId: q0.questionId, selectedIndex: 1 })
      .expect(409);

    const result = await server()
      .get(`/api/sessions/${play.id}/result`)
      .set('Authorization', auth(token))
      .expect(200);
    const body = result.body as SessionResultDto;
    expect(body.status).toBe('EXPIRED');
    expect(body.totals).toEqual({
      correct: 1,
      wrong: 0,
      skipped: 1,
      positiveMarks: 1,
      negativeMarks: 0,
      score: 1,
    });
  });
});
