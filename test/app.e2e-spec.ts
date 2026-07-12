import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { HealthResponseDto } from './../src/health/health-response.dto';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, 'http://localhost:4200');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // Requires the dev database (docker compose up -d) — PrismaService
  // connects on module init.
  it('GET /api/health returns status, version and db connectivity', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as HealthResponseDto;
        expect(body.status).toBe('ok');
        expect(typeof body.version).toBe('string');
        expect(body.db).toBe('up');
      });
  });
});
