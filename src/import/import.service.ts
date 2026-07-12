import { BadRequestException, Injectable } from '@nestjs/common';
import { CSV_COLUMNS, csvRowSchema } from '../domain/import.schema';
import { questionCreateSchema } from '../domain/question.schema';
import { stemHash } from '../domain/stem-hash';
import { PrismaService } from '../prisma/prisma.service';
import { parseCsv } from './csv-parser';
import { ImportReportDto, RowErrorDto } from './dto/import.dto';

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

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
}
