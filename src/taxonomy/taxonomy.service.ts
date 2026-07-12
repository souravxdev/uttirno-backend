import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExamTreeDto } from './dto/taxonomy.dto';

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<ExamTreeDto[]> {
    const [exams, counts] = await Promise.all([
      this.prisma.exam.findMany({
        orderBy: { slug: 'asc' },
        include: {
          subjects: {
            orderBy: { order: 'asc' },
            include: { topics: { orderBy: { order: 'asc' } } },
          },
        },
      }),
      this.prisma.question.groupBy({
        by: ['topicId'],
        where: { status: 'PUBLISHED' },
        _count: { _all: true },
      }),
    ]);

    const countByTopic = new Map(
      counts.map((row) => [row.topicId, row._count._all]),
    );

    return exams.map((exam) => ({
      id: exam.id,
      slug: exam.slug,
      name: exam.name,
      subjects: exam.subjects.map((subject) => ({
        id: subject.id,
        slug: subject.slug,
        name: subject.name,
        order: subject.order,
        topics: subject.topics.map((topic) => ({
          id: topic.id,
          slug: topic.slug,
          name: topic.name,
          order: topic.order,
          publishedQuestionCount: countByTopic.get(topic.id) ?? 0,
        })),
      })),
    }));
  }
}
