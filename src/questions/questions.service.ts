import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminQuestionListQuery,
  PublicQuestionListQuery,
  QuestionCreateInput,
  QuestionUpdateInput,
  questionMergedSchema,
} from '../domain/question.schema';
import { stemHash } from '../domain/stem-hash';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminQuestionDto,
  AdminQuestionListDto,
  PublicQuestionDto,
  PublicQuestionListDto,
} from './dto/question.dto';

type QuestionWithTopic = {
  id: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: AdminQuestionDto['difficulty'];
  sourceType: AdminQuestionDto['sourceType'];
  sourceYear: number | null;
  sourceExam: string | null;
  status: AdminQuestionDto['status'];
  language: AdminQuestionDto['language'];
  createdAt: Date;
  updatedAt: Date;
  topic: {
    id: string;
    slug: string;
    name: string;
    subject: { id: string; slug: string; name: string };
  };
};

const TOPIC_INCLUDE = {
  topic: {
    select: {
      id: true,
      slug: true,
      name: true,
      subject: { select: { id: true, slug: true, name: true } },
    },
  },
} as const;

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async publicList(
    query: PublicQuestionListQuery,
  ): Promise<PublicQuestionListDto> {
    const where = {
      status: 'PUBLISHED' as const,
      ...this.commonFilters(query),
    };
    const { items, total } = await this.page(where, query);
    return {
      // Explicit field picking — never spread the entity: correctIndex and
      // explanation must not leave the server before session submission.
      items: items.map((q) => QuestionsService.toPublicDto(q)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async adminList(
    query: AdminQuestionListQuery,
  ): Promise<AdminQuestionListDto> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.topicId ? { topicId: query.topicId } : {}),
      ...this.commonFilters(query),
    };
    const { items, total } = await this.page(where, query);
    return {
      items: items.map((q) => QuestionsService.toAdminDto(q)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(input: QuestionCreateInput): Promise<AdminQuestionDto> {
    await this.assertTopicExists(input.topicId);
    try {
      const question = await this.prisma.question.create({
        data: {
          ...input,
          stemHash: stemHash(input.stem),
          sourceYear: input.sourceYear ?? null,
          sourceExam: input.sourceExam ?? null,
        },
        include: TOPIC_INCLUDE,
      });
      return QuestionsService.toAdminDto(question);
    } catch (error) {
      throw QuestionsService.mapDuplicateStem(error);
    }
  }

  async findOne(id: string): Promise<AdminQuestionDto> {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: TOPIC_INCLUDE,
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return QuestionsService.toAdminDto(question);
  }

  async update(
    id: string,
    patch: QuestionUpdateInput,
  ): Promise<AdminQuestionDto> {
    const existing = await this.prisma.question.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Question not found');
    }

    const merged = questionMergedSchema.safeParse({
      topicId: patch.topicId ?? existing.topicId,
      stem: patch.stem ?? existing.stem,
      options: patch.options ?? existing.options,
      correctIndex: patch.correctIndex ?? existing.correctIndex,
      explanation: patch.explanation ?? existing.explanation,
      difficulty: patch.difficulty ?? existing.difficulty,
      sourceType: patch.sourceType ?? existing.sourceType,
      sourceYear:
        patch.sourceYear !== undefined ? patch.sourceYear : existing.sourceYear,
      sourceExam:
        patch.sourceExam !== undefined ? patch.sourceExam : existing.sourceExam,
      status: patch.status ?? existing.status,
      language: patch.language ?? existing.language,
    });
    if (!merged.success) {
      throw new BadRequestException({
        message: 'Update violates question invariants',
        errors: merged.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (patch.topicId && patch.topicId !== existing.topicId) {
      await this.assertTopicExists(patch.topicId);
    }

    try {
      const question = await this.prisma.question.update({
        where: { id },
        data: {
          ...merged.data,
          stemHash: stemHash(merged.data.stem),
          sourceYear: merged.data.sourceYear ?? null,
          sourceExam: merged.data.sourceExam ?? null,
        },
        include: TOPIC_INCLUDE,
      });
      return QuestionsService.toAdminDto(question);
    } catch (error) {
      throw QuestionsService.mapDuplicateStem(error);
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.question.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Question not found');
    }
    try {
      await this.prisma.question.delete({ where: { id } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2003') {
        throw new ConflictException(
          'Question has recorded answers and cannot be deleted',
        );
      }
      throw error;
    }
  }

  private commonFilters(query: PublicQuestionListQuery) {
    const topicFilter =
      query.subject || query.topic
        ? {
            topic: {
              ...(query.topic ? { slug: query.topic } : {}),
              ...(query.subject ? { subject: { slug: query.subject } } : {}),
            },
          }
        : {};
    return {
      ...topicFilter,
      ...(query.year !== undefined ? { sourceYear: query.year } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    };
  }

  private async page(
    where: object,
    query: { page: number; pageSize: number },
  ): Promise<{ items: QuestionWithTopic[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        include: TOPIC_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.question.count({ where }),
    ]);
    return { items, total };
  }

  private static mapDuplicateStem(error: unknown): unknown {
    if ((error as { code?: string }).code === 'P2002') {
      return new ConflictException(
        'A question with the same stem already exists',
      );
    }
    return error;
  }

  private async assertTopicExists(topicId: string): Promise<void> {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true },
    });
    if (!topic) {
      throw new BadRequestException('Unknown topicId');
    }
  }

  private static toPublicDto(q: QuestionWithTopic): PublicQuestionDto {
    return {
      id: q.id,
      stem: q.stem,
      options: q.options,
      difficulty: q.difficulty,
      sourceType: q.sourceType,
      sourceYear: q.sourceYear,
      sourceExam: q.sourceExam,
      language: q.language,
      topic: q.topic,
    };
  }

  private static toAdminDto(q: QuestionWithTopic): AdminQuestionDto {
    return {
      ...QuestionsService.toPublicDto(q),
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      status: q.status,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    };
  }
}
