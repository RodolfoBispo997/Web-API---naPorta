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

  async function createOrder(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', authorizationHeader())
      .send(validOrder(overrides))
      .expect(201);
  }

  async function findUnusedUtcDay(): Promise<string> {
    const firstDay = new Date('2400-01-01T00:00:00.000Z');
    firstDay.setUTCDate(
      firstDay.getUTCDate() + Math.floor(Math.random() * 100_000),
    );
    for (let offset = 0; offset < 100_000; offset += 1) {
      const candidate = new Date(firstDay);
      candidate.setUTCDate(candidate.getUTCDate() + offset);
      const day = candidate.toISOString().slice(0, 10);
      const nextDay = new Date(candidate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const count = await prisma.order.count({
        where: { createdAt: { gte: candidate, lt: nextDay } },
      });
      if (count === 0) return day;
    }
    throw new Error(
      'Could not find an unused UTC date in the isolated test database.',
    );
  }

  async function setOrderCreatedAt(
    id: string,
    createdAt: Date,
    status?: 'PENDING' | 'PROCESSING',
  ) {
    await prisma.order.update({
      where: { id },
      data: { createdAt, ...(status ? { status } : {}) },
    });
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

  it('filters by combined criteria and includes both UTC date boundaries while excluding deleted orders', async () => {
    const day = await findUnusedUtcDay();
    const beginning = new Date(`${day}T00:00:00.000Z`);
    const lastMillisecond = new Date(`${day}T23:59:59.999Z`);
    const nextDay = new Date(beginning);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const beforeBoundary = await createOrder();
    const onFinalMillisecond = await createOrder();
    const nextDayOrder = await createOrder();
    const deleted = await createOrder();
    await setOrderCreatedAt(beforeBoundary.body.id, beginning, 'PROCESSING');
    await setOrderCreatedAt(
      onFinalMillisecond.body.id,
      lastMillisecond,
      'PROCESSING',
    );
    await setOrderCreatedAt(nextDayOrder.body.id, nextDay, 'PROCESSING');
    await setOrderCreatedAt(deleted.body.id, lastMillisecond, 'PROCESSING');
    await prisma.order.update({
      where: { id: deleted.body.id },
      data: { deletedAt: new Date() },
    });

    const response = await request(app.getHttpServer())
      .get('/orders')
      .query({
        orderNumber: onFinalMillisecond.body.orderNumber,
        status: 'PROCESSING',
        startDate: day,
        endDate: day,
      })
      .set('Authorization', authorizationHeader())
      .expect(200);
    expect(response.body.data.map((order: { id: string }) => order.id)).toEqual(
      [onFinalMillisecond.body.id],
    );

    const dateRange = await request(app.getHttpServer())
      .get('/orders')
      .query({ startDate: day, endDate: day, limit: '100' })
      .set('Authorization', authorizationHeader())
      .expect(200);
    const returnedIds = dateRange.body.data.map(
      (order: { id: string }) => order.id,
    );
    expect(returnedIds).toContain(beforeBoundary.body.id);
    expect(returnedIds).toContain(onFinalMillisecond.body.id);
    expect(returnedIds).not.toContain(nextDayOrder.body.id);
    expect(returnedIds).not.toContain(deleted.body.id);
  });

  it('paginates with deterministic id ordering for tied timestamps and returns empty beyond the last page', async () => {
    const day = await findUnusedUtcDay();
    const timestamp = new Date(`${day}T12:00:00.000Z`);
    const created = await Promise.all([
      createOrder(),
      createOrder(),
      createOrder(),
    ]);
    for (const result of created) {
      await setOrderCreatedAt(result.body.id, timestamp);
    }
    const expectedIds = created
      .map((result) => result.body.id as string)
      .sort((left, right) => right.localeCompare(left));

    const first = await request(app.getHttpServer())
      .get('/orders')
      .query({ startDate: day, endDate: day, page: '1', limit: '2' })
      .set('Authorization', authorizationHeader())
      .expect(200);
    expect(first.body.data.map((order: { id: string }) => order.id)).toEqual(
      expectedIds.slice(0, 2),
    );
    expect(first.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });

    const last = await request(app.getHttpServer())
      .get('/orders')
      .query({ startDate: day, endDate: day, page: '2', limit: '2' })
      .set('Authorization', authorizationHeader())
      .expect(200);
    expect(last.body.data.map((order: { id: string }) => order.id)).toEqual(
      expectedIds.slice(2),
    );

    const beyond = await request(app.getHttpServer())
      .get('/orders')
      .query({ startDate: day, endDate: day, page: '3', limit: '2' })
      .set('Authorization', authorizationHeader())
      .expect(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta).toEqual({
      page: 3,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });
});
