import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { JwtTokenService } from '../src/auth/jwt-token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const testJwtSecret = 'orders-postgres-integration-secret-only';
const failureMarker = 'integration-write-failure-marker';

function requireIsolatedDatabaseUrl(): { url: string; databaseName: string } {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is required; select an isolated database named naporta_orders_test_<suffix>.',
    );
  }

  const parsedUrl = new URL(url);
  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\//, ''),
  );
  if (!/^naporta_orders_test_[a-z0-9_]+$/i.test(databaseName)) {
    throw new Error(
      'TEST_DATABASE_URL must select an isolated database named naporta_orders_test_<suffix>.',
    );
  }
  return { url, databaseName };
}

describe('orders PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bearerToken: string;
  const { url: isolatedDatabaseUrl, databaseName } =
    requireIsolatedDatabaseUrl();
  const runPrefix = `ORD-IT-${randomUUID().replaceAll('-', '').slice(0, 12)}-`;
  const failureConstraint = `naporta_orders_test_reject_${randomUUID().replaceAll('-', '')}`;
  let failureConstraintCreated = false;

  beforeAll(async () => {
    process.env.DATABASE_URL = isolatedDatabaseUrl;
    process.env.JWT_SECRET = testJwtSecret;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const [selectedDatabase] = await prisma.$queryRaw<
      Array<{ database_name: string }>
    >`
      SELECT current_database() AS database_name
    `;
    if (selectedDatabase.database_name !== databaseName) {
      throw new Error(
        'The connected PostgreSQL database did not match TEST_DATABASE_URL.',
      );
    }
    bearerToken = await app.get(JwtTokenService).issueAccessToken(randomUUID());
  });

  afterAll(async () => {
    try {
      if (prisma) {
        try {
          await dropFailureConstraintIfCreated();
        } finally {
          await prisma.order.deleteMany({
            where: { orderNumber: { startsWith: runPrefix } },
          });
        }
      }
    } finally {
      await app?.close();
    }
  });

  function validOrder(overrides: Record<string, unknown> = {}) {
    return {
      orderNumber: `${runPrefix}${randomUUID().slice(0, 8)}`,
      expectedDeliveryDate: '2026-12-31',
      customer: { name: 'Integration Customer', document: 'DOC-IT-1' },
      deliveryAddress: {
        street: 'Integration Street',
        number: '5',
        neighborhood: 'Test District',
        city: 'Campinas',
        state: 'SP',
        postalCode: '13000-000',
        country: 'BR',
      },
      items: [
        { description: 'First integration item', price: '19.90' },
        { description: 'Second integration item', price: '0' },
      ],
      ...overrides,
    };
  }

  function authorizationHeader() {
    return `Bearer ${bearerToken}`;
  }

  async function dropFailureConstraintIfCreated() {
    if (!failureConstraintCreated) return;
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "order_items" DROP CONSTRAINT "${failureConstraint}"`,
    );
    failureConstraintCreated = false;
  }

  it('persists an order and related items through the HTTP route', async () => {
    const payload = validOrder();
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', authorizationHeader())
      .send(payload)
      .expect(201);

    const persisted = await prisma.order.findUnique({
      where: { orderNumber: payload.orderNumber as string },
      include: { items: true },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.items).toHaveLength(2);
    expect(
      response.body.items.map((item: { price: string }) => item.price),
    ).toEqual(['19.90', '0.00']);
    expect(response.body.expectedDeliveryDate).toBe('2026-12-31');
  });

  it('returns 409 for an order number already protected by the PostgreSQL unique index', async () => {
    const payload = validOrder();
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', authorizationHeader())
        .send(payload),
      request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', authorizationHeader())
        .send(payload),
    ]);
    expect(
      responses.map(({ status }) => status).sort((left, right) => left - right),
    ).toEqual([201, 409]);
    expect(
      await prisma.order.count({
        where: { orderNumber: payload.orderNumber as string },
      }),
    ).toBe(1);
  });

  it('rolls back the order when PostgreSQL rejects a nested item write', async () => {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "order_items" ADD CONSTRAINT "${failureConstraint}" CHECK ("description" <> '${failureMarker}')`,
    );
    failureConstraintCreated = true;
    const payload = validOrder({
      items: [
        { description: 'Valid item before rejected item', price: '4.00' },
        { description: failureMarker, price: '5.00' },
      ],
    });

    try {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', authorizationHeader())
        .send(payload)
        .expect(500);
      expect(
        await prisma.order.findUnique({
          where: { orderNumber: payload.orderNumber as string },
        }),
      ).toBeNull();
    } finally {
      await dropFailureConstraintIfCreated();
    }
  });

  it('does not return an order after it is marked logically deleted', async () => {
    const payload = validOrder();
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', authorizationHeader())
      .send(payload)
      .expect(201);
    await prisma.order.update({
      where: { id: created.body.id as string },
      data: { deletedAt: new Date() },
    });
    await request(app.getHttpServer())
      .get(`/orders/${created.body.id as string}`)
      .set('Authorization', authorizationHeader())
      .expect(404);
  });
});
