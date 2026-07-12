import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

/**
 * Own app instance: the in-memory limiter is per-instance, so hammering
 * login here cannot poison the other suites (which run serially with their
 * own instances).
 */
describe('Auth rate limiting (e2e)', () => {
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

  it('returns 429 on login after 20 requests in the window', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@uttirno.test', password: 'wrong-password' });

    for (let i = 0; i < 20; i += 1) {
      await attempt().expect(401);
    }
    await attempt().expect(429);
  });
});
