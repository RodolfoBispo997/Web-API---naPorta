import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createDemoOrdersIfMissing,
  type DemoOrdersSeedResult,
  type DemoOrderSeed,
} from '../prisma/demo-orders-seed.js';
import { createDemoUserIfMissing } from '../prisma/demo-user-seed.js';

const testJwtSecret = 'demo-seed-postgres-test-secret-only';
const testPassword = 'integration-only-demo-password';

function requireIsolatedDatabaseUrl(): {
  url: string;
  databaseName: string;
} {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is required; select an isolated database named naporta_orders_test_<suffix>.',
    );
  }
  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^naporta_orders_test_[a-z0-9_]+$/i.test(databaseName)) {
    throw new Error(
      'TEST_DATABASE_URL must select an isolated database named naporta_orders_test_<suffix>.',
    );
  }
  return { url, databaseName };
}

async function seedOrdersOneAtATime(
  prisma: Parameters<typeof createDemoOrdersIfMissing>[0],
  orders: readonly DemoOrderSeed[],
  ownedOrderIds: string[],
): Promise<DemoOrdersSeedResult> {
  const result: DemoOrdersSeedResult = {
    created: 0,
    alreadyExisted: 0,
    createdOrderIds: [],
    createdOrderNumbers: [],
  };

  for (const order of orders) {
    // A one-order call preserves ownership information if a later order fails.
    const oneOrderResult = await createDemoOrdersIfMissing(prisma, [order]);
    result.created += oneOrderResult.created;
    result.alreadyExisted += oneOrderResult.alreadyExisted;
    result.createdOrderIds.push(...oneOrderResult.createdOrderIds);
    result.createdOrderNumbers.push(...oneOrderResult.createdOrderNumbers);
    ownedOrderIds.push(...oneOrderResult.createdOrderIds);
  }

  return result;
}

describe('demo data seed PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let demoUserExistedBefore = false;
  let seededUserCreated = false;
  const seededOrderIds: string[] = [];
  const { url, databaseName } = requireIsolatedDatabaseUrl();
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const configuredDemoEmail = process.env.DEMO_USER_EMAIL;
  const configuredDemoPassword = process.env.DEMO_USER_PASSWORD;
  const demoEmail = configuredDemoEmail ?? `seed-${runId}@example.test`;
  const demoPassword = configuredDemoPassword ?? testPassword;
  const firstOrderNumber = `DEMO-IT-${runId}-001`;
  const activeOrderNumber = `DEMO-IT-${runId}-002`;
  const preexistingOrderNumber = `DEMO-IT-${runId}-PRE`;
  const orders: DemoOrderSeed[] = [
    {
      orderNumber: firstOrderNumber,
      status: 'PENDING',
      createdAt: '2026-05-01T12:00:00.000Z',
      expectedDeliveryDate: '2026-05-10',
      customer: { name: 'Integration Fictional One', document: 'DOC-SEED-1' },
      deliveryAddress: {
        street: 'Seed Test Street',
        number: '1',
        neighborhood: 'Seed District',
        city: 'Test City',
        state: 'TS',
        postalCode: '00000-001',
        country: 'BR',
      },
      items: [{ description: 'Seed test item one', price: '10.25' }],
    },
    {
      orderNumber: activeOrderNumber,
      status: 'PROCESSING',
      createdAt: '2026-05-02T12:00:00.000Z',
      expectedDeliveryDate: '2026-05-12',
      customer: { name: 'Integration Fictional Two', document: 'DOC-SEED-2' },
      deliveryAddress: {
        street: 'Seed Test Street',
        number: '2',
        neighborhood: 'Seed District',
        city: 'Test City',
        state: 'TS',
        postalCode: '00000-002',
        country: 'BR',
      },
      items: [{ description: 'Seed test item two', price: '20.50' }],
    },
  ];
  const preexistingSeedOrder: DemoOrderSeed = {
    ...orders[0]!,
    orderNumber: preexistingOrderNumber,
    customer: {
      name: 'Seed must preserve this fictional order',
      document: `DOC-SEED-PRE-${runId}`,
    },
  };
  let firstRun: Awaited<ReturnType<typeof createDemoOrdersIfMissing>>;
  let repeatedRun: Awaited<ReturnType<typeof createDemoOrdersIfMissing>>;
  let preexistingRun: Awaited<ReturnType<typeof createDemoOrdersIfMissing>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.JWT_SECRET = testJwtSecret;
    if (Boolean(configuredDemoEmail) !== Boolean(configuredDemoPassword)) {
      throw new Error(
        'Set both DEMO_USER_EMAIL and DEMO_USER_PASSWORD for seed integration validation.',
      );
    }
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

    const existingUser = await prisma.user.findUnique({
      where: { email: demoEmail },
      select: { id: true },
    });
    demoUserExistedBefore = Boolean(existingUser);
    if (!configuredDemoEmail && existingUser) {
      throw new Error(
        'The randomized integration demo user unexpectedly existed before the suite.',
      );
    }
    const existingFixtureCount = await prisma.order.count({
      where: { orderNumber: { startsWith: `DEMO-IT-${runId}-` } },
    });
    if (existingFixtureCount > 0) {
      throw new Error(
        'Randomized demo seed integration identifiers already exist.',
      );
    }

    if (!existingUser) {
      seededUserCreated =
        (await createDemoUserIfMissing(prisma, demoEmail, demoPassword)) ===
        'created';
    }
    const preexistingCreatedAt = new Date('2026-05-03T10:00:00.000Z');
    const preexistingFixture = await prisma.order.create({
      data: {
        orderNumber: preexistingOrderNumber,
        status: 'CANCELLED',
        expectedDeliveryDate: new Date('2026-05-10T00:00:00.000Z'),
        customerName: 'Pre-existing integration fixture',
        customerDocument: `DOC-EXISTING-${runId}`,
        deliveryStreet: 'Existing Test Street',
        deliveryNumber: '9',
        deliveryComplement: null,
        deliveryNeighborhood: 'Existing Test District',
        deliveryCity: 'Test City',
        deliveryState: 'TS',
        deliveryPostalCode: '00000-009',
        deliveryCountry: 'BR',
        createdAt: preexistingCreatedAt,
        updatedAt: preexistingCreatedAt,
        deletedAt: new Date('2026-05-04T10:00:00.000Z'),
        items: {
          create: [{ description: 'Pre-existing item', price: '7.25' }],
        },
      },
      select: { id: true },
    });
    // Track the returned primary key so cleanup can never remove a replacement
    // row created by another process using the same unique order number.
    seededOrderIds.push(preexistingFixture.id);

    preexistingRun = await seedOrdersOneAtATime(
      prisma,
      [preexistingSeedOrder],
      seededOrderIds,
    );
    firstRun = await seedOrdersOneAtATime(prisma, orders, seededOrderIds);

    await prisma.order.update({
      where: { orderNumber: firstOrderNumber },
      data: {
        status: 'CANCELLED',
        customerName: 'Preservation marker from integration test',
        deletedAt: new Date('2026-05-03T12:00:00.000Z'),
      },
    });
    repeatedRun = await seedOrdersOneAtATime(prisma, orders, seededOrderIds);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.order.deleteMany({
          where: { id: { in: seededOrderIds } },
        });
        expect(
          await prisma.order.count({
            where: { id: { in: seededOrderIds } },
          }),
        ).toBe(0);
        expect(
          await prisma.order.count({
            where: { orderNumber: { startsWith: `DEMO-IT-${runId}-` } },
          }),
        ).toBe(0);
        if (seededUserCreated) {
          await prisma.user.deleteMany({ where: { email: demoEmail } });
          expect(
            await prisma.user.findUnique({
              where: { email: demoEmail },
              select: { id: true },
            }),
          ).toBeNull();
        } else if (demoUserExistedBefore) {
          expect(
            await prisma.user.findUnique({
              where: { email: demoEmail },
              select: { id: true },
            }),
          ).not.toBeNull();
        }
      }
    } finally {
      await app?.close();
    }
  });

  it('creates fictional orders and items on the first run and reports creation counts', async () => {
    expect(firstRun).toMatchObject({ created: 2, alreadyExisted: 0 });
    const persisted = await prisma.order.findUnique({
      where: { orderNumber: activeOrderNumber },
      include: { items: true },
    });
    expect(persisted).toMatchObject({
      status: 'PROCESSING',
      customerName: 'Integration Fictional Two',
      createdAt: new Date('2026-05-02T12:00:00.000Z'),
      items: [{ description: 'Seed test item two' }],
    });
    expect(persisted?.items[0].price.toFixed(2)).toBe('20.50');
  });

  it('preserves a pre-existing order even when it is modified and logically deleted', async () => {
    expect(preexistingRun).toMatchObject({ created: 0, alreadyExisted: 1 });
    expect(preexistingRun.createdOrderIds).toEqual([]);
    const persisted = await prisma.order.findUnique({
      where: { orderNumber: preexistingOrderNumber },
      include: { items: true },
    });
    expect(persisted).toMatchObject({
      status: 'CANCELLED',
      customerName: 'Pre-existing integration fixture',
      customerDocument: `DOC-EXISTING-${runId}`,
      deletedAt: new Date('2026-05-04T10:00:00.000Z'),
      items: [{ description: 'Pre-existing item' }],
    });
    expect(persisted?.items[0].price.toFixed(2)).toBe('7.25');
  });

  it('tracks and cleans completed writes when a later seed order fails', async () => {
    const partialOrderNumber = `DEMO-IT-${runId}-PARTIAL-001`;
    const failingOrderNumber = `DEMO-IT-${runId}-PARTIAL-002`;
    const partialOrders: DemoOrderSeed[] = [
      { ...orders[0]!, orderNumber: partialOrderNumber },
      {
        ...orders[1]!,
        orderNumber: failingOrderNumber,
        items: [
          {
            description: 'Out of range integration item',
            price: '10000000000.00',
          },
        ],
      },
    ];

    await expect(
      seedOrdersOneAtATime(prisma, partialOrders, seededOrderIds),
    ).rejects.toBeInstanceOf(Error);
    expect(
      await prisma.order.findUnique({
        where: { orderNumber: partialOrderNumber },
        select: { id: true },
      }),
    ).not.toBeNull();
    expect(
      await prisma.order.findUnique({
        where: { orderNumber: failingOrderNumber },
        select: { id: true },
      }),
    ).toBeNull();
  });

  it('does not duplicate or restore a modified logically deleted order on repeat', async () => {
    expect(repeatedRun).toMatchObject({ created: 0, alreadyExisted: 2 });
    const preserved = await prisma.order.findUnique({
      where: { orderNumber: firstOrderNumber },
      include: { items: true },
    });
    expect(preserved?.status).toBe('CANCELLED');
    expect(preserved?.customerName).toBe(
      'Preservation marker from integration test',
    );
    expect(preserved?.deletedAt).toEqual(new Date('2026-05-03T12:00:00.000Z'));
    expect(preserved?.items).toHaveLength(1);
  });

  it('logs in with the seeded user and lists the active seeded order over HTTP', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: demoEmail, password: demoPassword })
      .expect(200);
    expect(login.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      accessToken: expect.any(String),
    });

    const listing = await request(app.getHttpServer())
      .get('/orders')
      .query({ orderNumber: activeOrderNumber })
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(200);
    expect(listing.body.data).toHaveLength(1);
    expect(listing.body.data[0]).toMatchObject({
      orderNumber: activeOrderNumber,
      status: 'PROCESSING',
      customer: { name: 'Integration Fictional Two' },
      items: [{ description: 'Seed test item two', price: '20.50' }],
    });
  });
});
