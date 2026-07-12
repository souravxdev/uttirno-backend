import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AiDraftRequest,
  aiDraftResponseSchema,
  CSV_COLUMNS,
  csvRowSchema,
} from '../domain/import.schema';
import { questionCreateSchema } from '../domain/question.schema';
import { stemHash } from '../domain/stem-hash';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from '../questions/questions.service';
import { AiClient } from './ai-client';
import { parseCsv } from './csv-parser';
import {
  AiDraftReportDto,
  ImportReportDto,
  RowErrorDto,
} from './dto/import.dto';

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
    private readonly aiClient: AiClient,
  ) {}

  async importCsv(buffer: Buffer): Promise<ImportReportDto> {
    const { header, rows } = parseCsv(buffer.toString('utf8'));
    if (header.join(',') !== CSV_COLUMNS.join(',')) {
      throw new BadRequestException(
        `Invalid CSV header. Expected exactly: ${CSV_COLUMNS.join(',')}`,
      );
    }

    const report: ImportReportDto = {
      totalRows: rows.length,
      imported: 0,
      skippedDuplicates: 0,
      failed: 0,
      rowErrors: [],
    };

    const topics = await this.prisma.topic.findMany({
      select: { id: true, slug: true, subject: { select: { slug: true } } },
    });
    const topicIdBySlugs = new Map(
      topics.map((t) => [`${t.subject.slug}/${t.slug}`, t.id]),
    );
    const existing = await this.prisma.question.findMany({
      where: { stemHash: { not: null } },
      select: { stemHash: true },
    });
    const knownHashes = new Set(existing.map((q) => q.stemHash as string));

    for (let index = 0; index < rows.length; index += 1) {
      // Header is line 1, first data row is line 2.
      const rowNumber = index + 2;
      const cells = rows[index];

      const fail = (errors: RowErrorDto['errors']) => {
        report.failed += 1;
        report.rowErrors.push({ row: rowNumber, errors });
      };

      if (cells.length !== CSV_COLUMNS.length) {
        fail([
          {
            path: '',
            message: `Expected ${CSV_COLUMNS.length} columns, got ${cells.length}`,
          },
        ]);
        continue;
      }

      const rowObject = Object.fromEntries(
        CSV_COLUMNS.map((column, i) => [column, cells[i].trim()]),
      );
      const row = csvRowSchema.safeParse(rowObject);
      if (!row.success) {
        fail(
          row.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        );
        continue;
      }

      const topicId = topicIdBySlugs.get(
        `${row.data.subjectSlug}/${row.data.topicSlug}`,
      );
      if (!topicId) {
        fail([
          {
            path: 'topicSlug',
            message: `Unknown subject/topic: ${row.data.subjectSlug}/${row.data.topicSlug}`,
          },
        ]);
        continue;
      }

      // Reuse the ONE source of invariant truth — no duplicated rules here.
      const candidate = questionCreateSchema.safeParse({
        topicId,
        stem: row.data.stem,
        options: [
          row.data.option1,
          row.data.option2,
          row.data.option3,
          row.data.option4,
        ],
        correctIndex: row.data.correctOption - 1,
        explanation: row.data.explanation,
        difficulty: row.data.difficulty,
        sourceType: row.data.sourceType,
        sourceYear: row.data.sourceYear,
        sourceExam: row.data.sourceExam,
        // The one review queue: every CSV row enters IN_REVIEW.
        status: 'IN_REVIEW',
        language: row.data.language,
      });
      if (!candidate.success) {
        fail(
          candidate.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        );
        continue;
      }

      const hash = stemHash(candidate.data.stem);
      if (knownHashes.has(hash)) {
        report.skippedDuplicates += 1;
        continue;
      }

      try {
        await this.prisma.question.create({
          data: {
            ...candidate.data,
            stemHash: hash,
            sourceYear: candidate.data.sourceYear ?? null,
            sourceExam: candidate.data.sourceExam ?? null,
          },
        });
        knownHashes.add(hash);
        report.imported += 1;
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          report.skippedDuplicates += 1;
        } else {
          fail([{ path: '', message: 'Unexpected database error' }]);
        }
      }
    }

    return report;
  }

  async generateAiDrafts(input: AiDraftRequest): Promise<AiDraftReportDto> {
    const topic = await this.prisma.topic.findUnique({
      where: { id: input.topicId },
      select: {
        name: true,
        subject: {
          select: { name: true, exam: { select: { name: true } } },
        },
      },
    });
    if (!topic) {
      throw new BadRequestException('Unknown topicId');
    }

    const raw = await this.aiClient.generateDrafts(
      ImportService.buildDraftPrompt({
        examName: topic.subject.exam.name,
        subjectName: topic.subject.name,
        topicName: topic.name,
        count: input.count,
        difficulty: input.difficulty,
        language: input.language,
      }),
    );

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(ImportService.extractJson(raw));
    } catch {
      throw new BadGatewayException('Model returned unparseable output');
    }
    const drafts = aiDraftResponseSchema.safeParse(parsedJson);
    if (!drafts.success) {
      throw new BadGatewayException('Model returned invalid draft structure');
    }

    const report: AiDraftReportDto = {
      requested: input.count,
      created: 0,
      skippedDuplicates: 0,
      failed: 0,
      drafts: [],
    };
    for (const draft of drafts.data) {
      // Reuse the one invariant source. This path can NEVER publish:
      // status is hardcoded IN_REVIEW and the create schema additionally
      // rejects AI_GENERATED + PUBLISHED.
      const candidate = questionCreateSchema.safeParse({
        topicId: input.topicId,
        stem: draft.stem,
        options: draft.options,
        correctIndex: draft.correctIndex,
        explanation: draft.explanation,
        difficulty: input.difficulty,
        sourceType: 'AI_GENERATED',
        status: 'IN_REVIEW',
        language: input.language,
      });
      if (!candidate.success) {
        report.failed += 1;
        continue;
      }
      try {
        // QuestionsService.create sets stemHash and 409s on duplicates.
        report.drafts.push(await this.questions.create(candidate.data));
        report.created += 1;
      } catch (error) {
        if (error instanceof ConflictException) {
          report.skippedDuplicates += 1;
        } else {
          report.failed += 1;
        }
      }
    }
    return report;
  }

  private static buildDraftPrompt(args: {
    examName: string;
    subjectName: string;
    topicName: string;
    count: number;
    difficulty: string;
    language: string;
  }): string {
    const languageLabel = args.language === 'BN' ? 'Bangla (বাংলা)' : 'English';
    return [
      `You are generating multiple-choice questions for "${args.examName}" exam preparation.`,
      `Subject: ${args.subjectName}. Topic: ${args.topicName}. Difficulty: ${args.difficulty}.`,
      `Language for stems, options and explanations: ${languageLabel}.`,
      '',
      `Generate exactly ${args.count} questions. Requirements:`,
      '- Factually correct and unambiguous — exactly one clearly correct answer each.',
      '- Exactly 4 options; distractors plausible but definitely wrong.',
      '- Explanation: one or two sentences, same language as the stem.',
      '- No opinion-based, trick, or time-sensitive questions.',
      '',
      'Respond with ONLY a JSON array — no prose, no markdown fences:',
      '[{"stem": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..."}]',
    ].join('\n');
  }

  private static extractJson(text: string): string {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    return (fenced ? fenced[1] : text).trim();
  }
}
