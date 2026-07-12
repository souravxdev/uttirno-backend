import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { hash } from 'argon2';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { CurrentUser } from './../src/auth/decorators/current-user.decorator';
import { Roles } from './../src/auth/decorators/roles.decorator';
import { AuthResponseDto, UserDto } from './../src/auth/dto/auth-response.dto';
import { JwtAuthGuard } from './../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from './../src/auth/guards/roles.guard';
import { AuthenticatedUser } from './../src/auth/strategies/jwt.strategy';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Test-only controller proving @Roles(ADMIN): no admin endpoint exists in
 * the product yet (first real one arrives in Phase 1 Session 2).
 */
@Controller('admin-probe')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
class AdminProbeController {
  @Get()
  ping(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, role: user.role };
  }
}

// Requires the dev database (docker compose up -d).
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const runId = Date.now();
  const learnerEmail = `e2e-learner-${runId}@uttirno.test`;
  const adminEmail = `e2e-admin-${runId}@uttirno.test`;
  const password = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AdminProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, 'http://localhost:4200');
    await app.init();

    // Register always creates LEARNER; the admin account is created directly.
    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await hash(password),
        role: 'ADMIN',
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [learnerEmail, adminEmail] } },
    });
    await app.close();
  });

  const server = () => request(app.getHttpServer());

  describe('register', () => {
    it('creates a LEARNER and returns tokens without passwordHash', async () => {
      const res = await server()
        .post('/api/auth/register')
        .send({ email: learnerEmail, password, name: 'রাহিম' })
        .expect(201);
      const body = res.body as AuthResponseDto;
      expect(body.user.email).toBe(learnerEmail);
      expect(body.user.role).toBe('LEARNER');
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('rejects a duplicate email with 409', () => {
      return server()
        .post('/api/auth/register')
        .send({ email: learnerEmail, password })
        .expect(409);
    });

    it('rejects an invalid body with 400 (zod)', () => {
      return server()
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      const res = await server()
        .post('/api/auth/login')
        .send({ email: learnerEmail, password })
        .expect(200);
      expect((res.body as AuthResponseDto).accessToken).toBeTruthy();
    });

    it('rejects a wrong password with 401', () => {
      return server()
        .post('/api/auth/login')
        .send({ email: learnerEmail, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('me', () => {
    it('rejects a missing token with 401', () => {
      return server().get('/api/auth/me').expect(401);
    });

    it('rejects a garbage token with 401', () => {
      return server()
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });

    it('returns the current user with a valid token', async () => {
      const login = await server()
        .post('/api/auth/login')
        .send({ email: learnerEmail, password });
      const { accessToken } = login.body as AuthResponseDto;
      const res = await server()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const user = res.body as UserDto;
      expect(user.email).toBe(learnerEmail);
      expect(user.role).toBe('LEARNER');
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });
  });

  describe('refresh', () => {
    it('exchanges a refresh token for a working token pair', async () => {
      const login = await server()
        .post('/api/auth/login')
        .send({ email: learnerEmail, password });
      const { refreshToken } = login.body as AuthResponseDto;

      const res = await server()
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      const refreshed = res.body as AuthResponseDto;
      expect(refreshed.accessToken).toBeTruthy();

      await server()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshed.accessToken}`)
        .expect(200);
    });

    it('rejects an access token used as refresh token with 401', async () => {
      const login = await server()
        .post('/api/auth/login')
        .send({ email: learnerEmail, password });
      const { accessToken } = login.body as AuthResponseDto;
      return server()
        .post('/api/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);
    });
  });

  describe('role guard', () => {
    it('rejects a LEARNER on an ADMIN route with 403', async () => {
      const login = await server()
        .post('/api/auth/login')
        .send({ email: learnerEmail, password });
      const { accessToken } = login.body as AuthResponseDto;
      return server()
        .get('/api/admin-probe')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('allows an ADMIN through', async () => {
      const login = await server()
        .post('/api/auth/login')
        .send({ email: adminEmail, password });
      const { accessToken } = login.body as AuthResponseDto;
      const res = await server()
        .get('/api/admin-probe')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body).toEqual({ ok: true, role: 'ADMIN' });
    });
  });
});
