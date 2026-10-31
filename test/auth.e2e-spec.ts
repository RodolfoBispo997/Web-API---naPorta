import {
  Controller,
  Get,
  Module,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerStorageService,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthModule } from '../src/auth/auth.module.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/auth/auth.constants.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../src/auth/jwt-auth.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const testSecret = 'unit-and-e2e-only-secret-32-bytes-minimum';
const originalJwtSecret = process.env.JWT_SECRET;
const userId = 'a2fa1e3d-c590-472c-b5f3-38a3bf182a0a';
const email = 'demo@example.test';
const password = 'Valid password without a complexity rule';
const user = { id: userId, email, passwordHash: '' };
const findUnique = vi.fn();
const prismaMock = { user: { findUnique } };

@Controller('auth-test')
class ProtectedTestController {
  @Get('protected')
  @UseGuards(JwtAuthGuard)
  protectedRoute(@Req() requestContext: AuthenticatedRequest) {
    return { userId: requestContext.user.id };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ProtectedTestController],
  providers: [JwtAuthGuard],
})
class ProtectedTestModule {}

describe('JWT authentication HTTP flow', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = testSecret;
    user.passwordHash = await bcrypt.hash(password, 4);

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, ProtectedTestModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    app.get<ThrottlerStorageService>(getStorageToken()).onApplicationShutdown();
    user.passwordHash = await bcrypt.hash(password, 4);
    findUnique.mockImplementation(
      async ({ where }: { where: { email: string } }) =>
        where.email === email ? user : null,
    );
  });

  afterAll(async () => {
    await app?.close();
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('logs in and returns only the documented token fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ` ${email.toUpperCase()} `, password })
      .expect(200);

    expect(response.body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('returns a generic 401 for an unknown user', async () => {
    findUnique.mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'missing@example.test', password })
      .expect(401);

    expect(response.body.message).toBe('Invalid email or password.');
  });

  it('returns the same generic 401 for an incorrect password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'incorrect password' })
      .expect(401);

    expect(response.body.message).toBe('Invalid email or password.');
  });

  it('validates login input', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password })
      .expect(400);
  });

  it('limits login per IP, ignores forwarded headers and releases after the block', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '192.0.2.1')
        .send({ email, password })
        .expect(200);
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .set('X-Forwarded-For', `192.0.2.${i + 1}`)
          .send({ email, password: 'incorrect password' })
          .expect(401);
      }
      expect(findUnique).toHaveBeenCalledTimes(5);

      const blocked = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '192.0.2.99')
        .send({ email, password })
        .expect(429);
      expect(blocked.headers['retry-after']).toBe('60');
      expect(findUnique).toHaveBeenCalledTimes(5);

      clock.mockReturnValue(now + 60_001);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      expect(findUnique).toHaveBeenCalledTimes(6);
    } finally {
      clock.mockRestore();
    }
  });

  async function loginGuardForAddressTest() {
    const guard = new ThrottlerGuard(
      app.get<ThrottlerModuleOptions>(getOptionsToken()),
      app.get<ThrottlerStorageService>(getStorageToken()),
      app.get(Reflector),
    );
    await guard.onModuleInit();
    return (ip: string) =>
      guard.canActivate({
        getClass: () => AuthController,
        getHandler: () => Reflect.get(AuthController.prototype, 'login'),
        switchToHttp: () => ({
          getRequest: () => ({ ip, headers: {} }),
          getResponse: () => ({ header: vi.fn() }),
        }),
      } as unknown as ExecutionContext);
  }

  it('shares the login limit between IPv6 addresses in the same /64', async () => {
    const activate = await loginGuardForAddressTest();
    for (let i = 0; i < 5; i++) {
      await expect(activate('2001:db8:1234:5678::1')).resolves.toBe(true);
    }
    await expect(activate('2001:db8:1234:5678::2')).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('keeps independent counters for different IPv6 /64 subnets', async () => {
    const activate = await loginGuardForAddressTest();
    for (let i = 0; i < 5; i++) {
      await expect(activate('2001:db8:1234:5678::1')).resolves.toBe(true);
    }
    await expect(activate('2001:db8:1234:5678::2')).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    for (let i = 0; i < 5; i++) {
      await expect(activate('2001:db8:1234:5679::1')).resolves.toBe(true);
    }
    await expect(activate('2001:db8:1234:5679::2')).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('shares a counter for an IPv4 address and its IPv6-mapped form', async () => {
    const activate = await loginGuardForAddressTest();
    for (let i = 0; i < 5; i++) {
      await expect(activate('::ffff:192.0.2.10')).resolves.toBe(true);
    }
    await expect(activate('192.0.2.10')).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    await expect(activate('192.0.2.11')).resolves.toBe(true);
  });

  it('accepts a password of exactly 72 UTF-8 bytes over HTTP', async () => {
    const maxPassword = 'x'.repeat(72);
    user.passwordHash = await bcrypt.hash(maxPassword, 4);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: maxPassword })
      .expect(200);
  });

  it('rejects passwords above 72 UTF-8 bytes over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'x'.repeat(73) })
      .expect(400);
    expect(response.body.message).toContain('72 UTF-8 bytes');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('measures multibyte passwords by UTF-8 bytes over HTTP', async () => {
    const password72Bytes = 'é'.repeat(36);
    const password74Bytes = 'é'.repeat(37);
    user.passwordHash = await bcrypt.hash(password72Bytes, 4);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: password72Bytes })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: password74Bytes })
      .expect(400);
  });

  it('rejects a value sharing the stored password first 72 bytes', async () => {
    const registeredPassword = 'x'.repeat(72);
    user.passwordHash = await bcrypt.hash(registeredPassword, 4);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: `${registeredPassword}extra` })
      .expect(400);
  });

  it('rejects a missing bearer token', async () => {
    await request(app.getHttpServer()).get('/auth-test/protected').expect(401);
  });

  it('rejects an invalid bearer token', async () => {
    await request(app.getHttpServer())
      .get('/auth-test/protected')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('rejects an authorization scheme other than Bearer', async () => {
    await request(app.getHttpServer())
      .get('/auth-test/protected')
      .set('Authorization', 'Basic invalid-token')
      .expect(401);
  });

  it('rejects an expired bearer token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(now - 60)
      .setExpirationTime(now - 1)
      .sign(new TextEncoder().encode(testSecret));

    await request(app.getHttpServer())
      .get('/auth-test/protected')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('accepts a valid login token on a protected test-only route', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const protectedResponse = await request(app.getHttpServer())
      .get('/auth-test/protected')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(protectedResponse.body).toEqual({ userId });
  });
});
