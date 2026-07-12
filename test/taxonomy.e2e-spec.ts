import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { ExamTreeDto } from './../src/taxonomy/dto/taxonomy.dto';

// Requires the dev database, freshly seeded (docker compose up -d && pnpm db:seed).
describe('Taxonomy (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, 'http://localhost:4200');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/taxonomy/tree returns the seeded structure with counts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/taxonomy/tree')
      .expect(200);
    const tree = res.body as ExamTreeDto[];

    const bcs = tree.find((exam) => exam.slug === 'bcs-preliminary');
    expect(bcs).toBeDefined();
    expect(bcs!.name).toBe('বিসিএস প্রিলিমিনারি');

    const subjectSlugs = bcs!.subjects.map((subject) => subject.slug);
    expect(subjectSlugs).toEqual(
      expect.arrayContaining(['bangla', 'english', 'general-knowledge']),
    );

    const bangla = bcs!.subjects.find((subject) => subject.slug === 'bangla')!;
    expect(bangla.name).toBe('বাংলা');
    const sahitto = bangla.topics.find((topic) => topic.slug === 'sahitto')!;
    // Seed publishes 2 questions in bangla/sahitto.
    expect(sahitto.publishedQuestionCount).toBe(2);

    const english = bcs!.subjects.find(
      (subject) => subject.slug === 'english',
    )!;
    const grammar = english.topics.find((topic) => topic.slug === 'grammar')!;
    // Seed has 2 grammar questions but only 1 is PUBLISHED (1 DRAFT).
    expect(grammar.publishedQuestionCount).toBe(1);
  });
});
