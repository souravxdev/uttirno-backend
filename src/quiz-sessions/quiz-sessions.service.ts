import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateSessionInput,
  SaveAnswerInput,
  SessionHistoryQuery,
} from '../domain/session.schema';
import { PrismaService } from '../prisma/prisma.service';
import {
  SaveAnswerResponseDto,
  SessionHistoryDto,
  SessionPlayStateDto,
  SessionResultDto,
  SessionSummaryDto,
} from './dto/session.dto';

/** Network-latency grace for answer saves; the EXPIRED flip itself is strict. */
const SAVE_GRACE_MS = 5_000;

type SessionRecord = {
  id: string;
  userId: string;
  status: SessionSummaryDto['status'];
  questionCount: number;
  timeLimitSec: number;
  startedAt: Date | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  score: unknown;
  createdAt: Date;
};

@Injectable()
export class QuizSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    input: CreateSessionInput,
  ): Promise<SessionSummaryDto> {
    const exam = await this.prisma.exam.findFirst({
      orderBy: { slug: 'asc' },
      select: { id: true },
    });
    if (!exam) {
      throw new BadRequestException('No exam is configured');
    }

    const questionIds = await this.pickRandomPublishedIds(
      input.questionCount,
      input.subjects,
      input.topics,
    );
    if (questionIds.length < input.questionCount) {
      throw new BadRequestException(
        `Only ${questionIds.length} published questions match this ` +
          `configuration (requested ${input.questionCount})`,
      );
    }

    // The question set is snapshotted as Answer rows — immutable for the
    // lifetime of the session, whatever admins do to the bank meanwhile.
    const session = await this.prisma.quizSession.create({
      data: {
        userId,
        examId: exam.id,
        questionCount: input.questionCount,
        timeLimitSec: input.timeLimitSec,
        answers: {
          create: questionIds.map((questionId, order) => ({
            questionId,
            order,
          })),
        },
      },
    });
    return QuizSessionsService.toSummary(session);
  }

  async start(userId: string, id: string): Promise<SessionPlayStateDto> {
    const session = await this.getOwned(id, userId);
    if (session.status !== 'CREATED') {
      throw new ConflictException('Session has already been started');
    }
    const now = new Date();
    const flipped = await this.prisma.quizSession.updateMany({
      where: { id, status: 'CREATED' },
      data: {
        status: 'IN_PROGRESS',
        startedAt: now,
        expiresAt: new Date(now.getTime() + session.timeLimitSec * 1000),
      },
    });
    if (flipped.count === 0) {
      throw new ConflictException('Session has already been started');
    }
    return this.playState(userId, id);
  }

  async summary(userId: string, id: string): Promise<SessionSummaryDto> {
    const session = await this.getOwned(id, userId);
    if (await this.expireIfDue(session)) {
      return QuizSessionsService.toSummary(await this.getOwned(id, userId));
    }
    return QuizSessionsService.toSummary(session);
  }

  async playState(userId: string, id: string): Promise<SessionPlayStateDto> {
    const session = await this.getOwned(id, userId);
    const expired = await this.expireIfDue(session);
    if (
      expired ||
      session.status === 'SUBMITTED' ||
      session.status === 'EXPIRED'
    ) {
      throw new ConflictException('Session has ended — fetch the result');
    }

    const answers = await this.prisma.answer.findMany({
      where: { sessionId: id },
      orderBy: { order: 'asc' },
      select: {
        order: true,
        questionId: true,
        selectedIndex: true,
        question: { select: { stem: true, options: true, language: true } },
      },
    });

    return {
      id: session.id,
      status: session.status,
      questionCount: session.questionCount,
      timeLimitSec: session.timeLimitSec,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      remainingSec:
        session.status === 'IN_PROGRESS' && session.expiresAt
          ? Math.max(
              0,
              Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000),
            )
          : null,
      // Explicit field picking — correctIndex/explanation must never appear
      // in any pre-submission payload.
      questions: answers.map((answer) => ({
        order: answer.order,
        questionId: answer.questionId,
        stem: answer.question.stem,
        options: answer.question.options,
        language: answer.question.language,
        selectedIndex: answer.selectedIndex,
      })),
    };
  }

  async saveAnswer(
    userId: string,
    id: string,
    input: SaveAnswerInput,
  ): Promise<SaveAnswerResponseDto> {
    const session = await this.getOwned(id, userId);
    if (session.status === 'CREATED') {
      throw new ConflictException('Session has not started yet');
    }
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Session has ended');
    }
    const now = Date.now();
    if (
      !session.expiresAt ||
      now > session.expiresAt.getTime() + SAVE_GRACE_MS
    ) {
      await this.expireIfDue(session);
      throw new ConflictException('Time is up — session has ended');
    }

    const saved = await this.prisma.answer.updateMany({
      where: { sessionId: id, questionId: input.questionId },
      data: {
        selectedIndex: input.selectedIndex,
        timeTakenSec: input.timeTakenSec,
      },
    });
    if (saved.count === 0) {
      throw new BadRequestException('Question is not part of this session');
    }
    return {
      questionId: input.questionId,
      selectedIndex: input.selectedIndex,
      remainingSec: Math.max(
        0,
        Math.ceil((session.expiresAt.getTime() - now) / 1000),
      ),
    };
  }

  async submit(userId: string, id: string): Promise<SessionResultDto> {
    const session = await this.getOwned(id, userId);
    if (session.status === 'CREATED') {
      throw new ConflictException('Session has not started yet');
    }
    if (session.status === 'SUBMITTED') {
      throw new ConflictException('Session has already been submitted');
    }
    // Timed out (or already EXPIRED): the expiry path scored the saved
    // answers — submitting late just returns the result.
    if ((await this.expireIfDue(session)) || session.status === 'EXPIRED') {
      return this.result(userId, id);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.quizSession.updateMany({
        where: { id, status: 'IN_PROGRESS' },
        data: { status: 'SUBMITTED', submittedAt: now },
      });
      if (flipped.count === 0) {
        throw new ConflictException('Session has already been submitted');
      }
      await QuizSessionsService.finalize(tx, id);
    });
    return this.result(userId, id);
  }

  async result(userId: string, id: string): Promise<SessionResultDto> {
    let session = await this.getOwned(id, userId);
    if (await this.expireIfDue(session)) {
      session = await this.getOwned(id, userId);
    }
    if (session.status !== 'SUBMITTED' && session.status !== 'EXPIRED') {
      throw new ConflictException(
        'Results are available only after submission',
      );
    }

    const answers = await this.prisma.answer.findMany({
      where: { sessionId: id },
      orderBy: { order: 'asc' },
      select: {
        order: true,
        questionId: true,
        selectedIndex: true,
        isCorrect: true,
        question: {
          select: {
            stem: true,
            options: true,
            correctIndex: true,
            explanation: true,
            language: true,
            topic: {
              select: {
                subject: {
                  select: { slug: true, name: true, order: true },
                },
              },
            },
          },
        },
      },
    });

    const correct = answers.filter((a) => a.isCorrect === true).length;
    const wrong = answers.filter((a) => a.isCorrect === false).length;
    const skipped = answers.filter((a) => a.selectedIndex === null).length;

    const bySubject = new Map<
      string,
      {
        subjectSlug: string;
        subjectName: string;
        subjectOrder: number;
        correct: number;
        wrong: number;
        skipped: number;
      }
    >();
    for (const answer of answers) {
      const subject = answer.question.topic.subject;
      const bucket = bySubject.get(subject.slug) ?? {
        subjectSlug: subject.slug,
        subjectName: subject.name,
        subjectOrder: subject.order,
        correct: 0,
        wrong: 0,
        skipped: 0,
      };
      if (answer.selectedIndex === null) {
        bucket.skipped += 1;
      } else if (answer.isCorrect) {
        bucket.correct += 1;
      } else {
        bucket.wrong += 1;
      }
      bySubject.set(subject.slug, bucket);
    }
    const subjectBreakdown = [...bySubject.values()]
      .sort((a, b) => a.subjectOrder - b.subjectOrder)
      .map((bucket) => ({
        subjectSlug: bucket.subjectSlug,
        subjectName: bucket.subjectName,
        correct: bucket.correct,
        wrong: bucket.wrong,
        skipped: bucket.skipped,
        score: (bucket.correct * 100 - bucket.wrong * 50) / 100,
      }));

    return {
      id: session.id,
      status: session.status,
      questionCount: session.questionCount,
      timeLimitSec: session.timeLimitSec,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      totals: {
        correct,
        wrong,
        skipped,
        positiveMarks: correct,
        negativeMarks: wrong * 0.5,
        score: session.score === null ? 0 : Number(session.score),
      },
      subjectBreakdown,
      items: answers.map((answer) => ({
        order: answer.order,
        questionId: answer.questionId,
        stem: answer.question.stem,
        options: answer.question.options,
        language: answer.question.language,
        selectedIndex: answer.selectedIndex,
        correctIndex: answer.question.correctIndex,
        isCorrect: answer.isCorrect,
        explanation: answer.question.explanation,
      })),
    };
  }

  async history(
    userId: string,
    query: SessionHistoryQuery,
  ): Promise<SessionHistoryDto> {
    // Lazily expire any of this user's sessions whose clock ran out.
    const due = await this.prisma.quizSession.findMany({
      where: { userId, status: 'IN_PROGRESS', expiresAt: { lt: new Date() } },
      select: { id: true, status: true, expiresAt: true },
    });
    for (const session of due) {
      await this.expireIfDue(session);
    }

    const [items, total] = await Promise.all([
      this.prisma.quizSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.quizSession.count({ where: { userId } }),
    ]);
    return {
      items: items.map((session) => QuizSessionsService.toSummary(session)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Foreign sessions 404 (not 403) — don't leak existence. */
  private async getOwned(id: string, userId: string): Promise<SessionRecord> {
    const session = await this.prisma.quizSession.findUnique({
      where: { id },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  /**
   * Lazy expiry: no cron — any access flips an overdue IN_PROGRESS session
   * to EXPIRED and scores the answers saved so far (auto-submit semantics).
   * Returns true if THIS call performed the flip.
   */
  private async expireIfDue(session: {
    id: string;
    status: string;
    expiresAt: Date | null;
  }): Promise<boolean> {
    if (
      session.status !== 'IN_PROGRESS' ||
      !session.expiresAt ||
      session.expiresAt.getTime() > Date.now()
    ) {
      return false;
    }
    return this.prisma.$transaction(async (tx) => {
      const flipped = await tx.quizSession.updateMany({
        where: { id: session.id, status: 'IN_PROGRESS' },
        data: { status: 'EXPIRED' },
      });
      if (flipped.count === 0) {
        return false;
      }
      await QuizSessionsService.finalize(tx, session.id);
      return true;
    });
  }

  /**
   * Scoring — server-side only. +1.00 per correct, −0.50 per wrong,
   * 0 per skipped. Integer math to dodge float drift.
   */
  private static async finalize(
    tx: Pick<PrismaService, 'answer' | 'quizSession'>,
    sessionId: string,
  ): Promise<void> {
    const answers = await tx.answer.findMany({
      where: { sessionId },
      select: {
        id: true,
        selectedIndex: true,
        question: { select: { correctIndex: true } },
      },
    });
    let correct = 0;
    let wrong = 0;
    for (const answer of answers) {
      if (answer.selectedIndex === null) {
        continue;
      }
      const isCorrect = answer.selectedIndex === answer.question.correctIndex;
      if (isCorrect) {
        correct += 1;
      } else {
        wrong += 1;
      }
      await tx.answer.update({
        where: { id: answer.id },
        data: { isCorrect },
      });
    }
    const score100 = correct * 100 - wrong * 50;
    await tx.quizSession.update({
      where: { id: sessionId },
      data: { score: score100 / 100 },
    });
  }

  private async pickRandomPublishedIds(
    count: number,
    subjects?: string[],
    topics?: string[],
  ): Promise<string[]> {
    const subjectFilter = subjects?.length ? subjects : null;
    const topicFilter = topics?.length ? topics : null;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT q.id
      FROM "Question" q
      JOIN "Topic" t ON t.id = q."topicId"
      JOIN "Subject" s ON s.id = t."subjectId"
      WHERE q.status = 'PUBLISHED'
        AND (${subjectFilter}::text[] IS NULL OR s.slug = ANY(${subjectFilter}::text[]))
        AND (${topicFilter}::text[] IS NULL OR t.slug = ANY(${topicFilter}::text[]))
      ORDER BY random()
      LIMIT ${count}`;
    return rows.map((row) => row.id);
  }

  private static toSummary(session: SessionRecord): SessionSummaryDto {
    return {
      id: session.id,
      status: session.status,
      questionCount: session.questionCount,
      timeLimitSec: session.timeLimitSec,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      submittedAt: session.submittedAt,
      score: session.score === null ? null : Number(session.score),
      createdAt: session.createdAt,
    };
  }
}
