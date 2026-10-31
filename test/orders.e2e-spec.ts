import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../src/generated/prisma/client.js';
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
import { AppModule } from '../src/app.module.js';
import { JwtTokenService } from '../src/auth/jwt-token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const testSecret = 'orders-http-only-secret-with-more-than-32-bytes';
const originalJwtSecret = process.env.JWT_SECRET;
const orderId = 'c0290cbd-33d9-44bb-9bad-6d194e0c2f86';
const input = {
  orderNumber: 'ORD-HTTP-100',
  expectedDeliveryDate: '2026-12-31',
  customer: { name: '  Ada Lovelace  ', document: ' DOC-1 ' },
  deliveryAddress: {
    street: ' Main Street ',
    number: ' 10 ',
    neighborhood: ' Center ',
    city: ' Springfield ',
    state: ' SP ',
    postalCode: ' 01000-000 ',
    country: ' BR ',
    complement: ' Apt 2 ',
  },
  items: [
    { description: ' Widget ', price: '12.3' },
    { description: ' Gadget ', price: '0.00' },
  ],
};

function makeOrder() {
  const createdAt = new Date('2026-10-31T14:00:00.000Z');
  return {
    id: orderId,
    orderNumber: 'ORD-HTTP-100',
    status: 'PENDING' as const,
    expectedDeliveryDate: new Date('2026-12-31T00:00:00.000Z'),
    customerName: 'Ada Lovelace',
    customerDocument: 'DOC-1',
    deliveryStreet: 'Main Street',
    deliveryNumber: '10',
    deliveryComplement: 'Apt 2',
    deliveryNeighborhood: 'Center',
    deliveryCity: 'Springfield',
    deliveryState: 'SP',
    deliveryPostalCode: '01000-000',
    deliveryCountry: 'BR',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    items: [
      {
        id: 'c0290cbd-33d9-44bb-9bad-6d194e0c2f87',
        orderId,
        description: 'Widget',
        price: new Prisma.Decimal('12.30'),
      },
      {
        id: 'c0290cbd-33d9-44bb-9bad-6d194e0c2f88',
        orderId,
        description: 'Gadget',
        price: new Prisma.Decimal('0.00'),
      },
    ],
  };
}

describe('orders HTTP routes', () => {
  let app: INestApplication;
  let token: string;
  const create = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const count = vi.fn();
  const updateMany = vi.fn();
  const itemDeleteMany = vi.fn();
  const itemCreateMany = vi.fn();
  const transaction = vi.fn(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        order: { updateMany, findFirst },
        orderItem: { deleteMany: itemDeleteMany, createMany: itemCreateMany },
      }),
  );
  const prismaMock = {
    order: { create, findFirst, findMany, count, updateMany },
    $transaction: transaction,
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = testSecret;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
    token = await app.get(JwtTokenService).issueAccessToken(orderId);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(makeOrder());
    findFirst.mockResolvedValue(makeOrder());
    findMany.mockResolvedValue([makeOrder()]);
    count.mockResolvedValue(1);
    updateMany.mockResolvedValue({ count: 1 });
    itemDeleteMany.mockResolvedValue({ count: 2 });
    itemCreateMany.mockResolvedValue({ count: 1 });
  });

  afterAll(async () => {
    await app?.close();
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('keeps order authentication unchanged when login is rate limited', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    }
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(429);
    await request(app.getHttpServer()).get('/orders').expect(401);
    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('creates an order with multiple items and returns the documented shape', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(201);

    expect(response.body).toMatchObject({
      id: orderId,
      orderNumber: 'ORD-HTTP-100',
      status: 'PENDING',
      expectedDeliveryDate: '2026-12-31',
      customer: { name: 'Ada Lovelace', document: 'DOC-1' },
      deliveryAddress: { street: 'Main Street', complement: 'Apt 2' },
      items: [
        { description: 'Widget', price: '12.30' },
        { description: 'Gadget', price: '0.00' },
      ],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(create.mock.calls[0][0].data.items.create).toEqual([
      { description: 'Widget', price: '12.3' },
      { description: 'Gadget', price: '0.00' },
    ]);
  });

  it.each(['customer', 'deliveryAddress'] as const)(
    'rejects an array for %s without calling persistence',
    async (field) => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...input, [field]: [] })
        .expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('returns 409 for a duplicate order number', async () => {
    create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['order_number'] },
    });
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(409);
  });

  it.each(['2026-02-29', '2026-13-01', '31/12/2026', '2026-2-01'])(
    'rejects invalid calendar date %s',
    async (expectedDeliveryDate) => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...input, expectedDeliveryDate })
        .expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(['-1.00', '1.001', '10000000000.00', '1e2', 1])(
    'rejects invalid or out-of-range price %s',
    async (price) => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...input, items: [{ description: 'Item', price }] })
        .expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('accepts a decimal price string with two fractional digits', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...input, items: [{ description: 'Item', price: '12.30' }] })
      .expect(201);
    expect(create.mock.calls[0][0].data.items.create).toEqual([
      { description: 'Item', price: '12.30' },
    ]);
  });

  it('rejects a price containing non-decimal characters', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...input, items: [{ description: 'Item', price: '12x30' }] })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    { nestedItem: [] },
    { nestedItem: [{ description: 'Produto', price: '1.00' }] },
  ])(
    'rejects a nested array as an item in POST before calling Prisma: $nestedItem',
    async ({ nestedItem }) => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...input, items: [nestedItem] })
        .expect(400);
      expect(create).not.toHaveBeenCalled();
      expect(findFirst).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects empty items and unknown fields at nested levels', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...input, items: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...input, customer: { ...input.customer, role: 'admin' } })
      .expect(400);
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...input,
        deliveryAddress: { ...input.deliveryAddress, unknown: true },
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...input,
        items: [{ ...input.items[0], unknown: true }],
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...input, id: orderId })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects text values that are empty after trimming', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...input, customer: { ...input.customer, name: '   ' } })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns an existing order and its items', async () => {
    const response = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].price).toBe('12.30');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: orderId, deletedAt: null },
      include: { items: true },
    });
  });

  it('lists orders and returns pagination metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toMatchObject({
      data: [{ id: orderId, orderNumber: 'ORD-HTTP-100' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(response.body.data[0].items[0].price).toBe('12.30');
    expect(response.body.data[0].items).toHaveLength(2);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 20,
    });
    expect(count).toHaveBeenCalledWith({
      where: findMany.mock.calls[0][0].where,
    });
  });

  it('trims an exact order number and combines filters and pagination', async () => {
    await request(app.getHttpServer())
      .get('/orders')
      .query({
        orderNumber: '  ORD-HTTP-100 ',
        status: 'PROCESSING',
        startDate: '2024-02-29',
        endDate: '2024-03-01',
        page: '2',
        limit: '5',
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: {
        deletedAt: null,
        AND: [
          { orderNumber: 'ORD-HTTP-100' },
          { status: 'PROCESSING' },
          {
            createdAt: {
              gte: new Date('2024-02-29T00:00:00.000Z'),
              lt: new Date('2024-03-02T00:00:00.000Z'),
            },
          },
        ],
      },
      skip: 5,
      take: 5,
    });
  });

  it.each(['PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED'])(
    'accepts order status %s',
    async (status) => {
      await request(app.getHttpServer())
        .get('/orders')
        .query({ status })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(findMany.mock.calls[0][0].where.AND).toEqual([{ status }]);
    },
  );

  it.each([
    { status: 'UNKNOWN' },
    { status: '' },
    { orderNumber: '   ' },
    { startDate: '2026-02-29' },
    { startDate: '2026-13-01' },
    { startDate: '' },
    { endDate: '' },
    { startDate: '2026-12-31', endDate: '2026-01-01' },
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'abc' },
    { page: '1e2' },
    { page: '10001' },
    { page: '9007199254740993' },
    { page: '' },
    { limit: '0' },
    { limit: '101' },
    { limit: '2.5' },
    { extra: 'value' },
    { status: ['PENDING', 'DELIVERED'] },
    { orderNumber: ['ORD-1', 'ORD-2'] },
    { page: ['1', '2'] },
  ])('rejects invalid list query $status', async (query) => {
    await request(app.getHttpServer())
      .get('/orders')
      .query(query)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('accepts the leap day and permits either side of a date range alone', async () => {
    for (const query of [
      { startDate: '2024-02-29' },
      { endDate: '2024-12-31' },
    ]) {
      await request(app.getHttpServer())
        .get('/orders')
        .query(query)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  });

  it.each(['1', '100'])('accepts limit boundary %s', async (limit) => {
    await request(app.getHttpServer())
      .get('/orders')
      .query({ limit })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(findMany.mock.calls[0][0].take).toBe(Number(limit));
  });

  it('accepts the maximum page and limit values without querying beyond the requested page', async () => {
    await request(app.getHttpServer())
      .get('/orders')
      .query({ page: '10000', limit: '100' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      skip: 999_900,
      take: 100,
    });
  });

  it('partially updates order, customer, and address and preserves omitted values', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderNumber: ' ORD-HTTP-UPDATED ',
        status: 'PROCESSING',
        customer: { name: ' Updated Ada ' },
        deliveryAddress: { complement: null },
      })
      .expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(transaction).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: orderId, deletedAt: null },
      data: {
        updatedAt: expect.any(Date),
        orderNumber: 'ORD-HTTP-UPDATED',
        status: 'PROCESSING',
        customerName: 'Updated Ada',
        deliveryComplement: null,
      },
    });
    expect(itemDeleteMany).not.toHaveBeenCalled();
  });

  it('replaces items as a whole when an item array is supplied', async () => {
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { description: ' New item ', price: '12.30' },
          { description: ' Other item ', price: '1.00' },
        ],
      })
      .expect(200);
    expect(itemDeleteMany).toHaveBeenCalledWith({
      where: { orderId },
    });
    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [
        { orderId, description: 'New item', price: '12.30' },
        { orderId, description: 'Other item', price: '1.00' },
      ],
    });
  });

  it.each(['PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED'])(
    'accepts status update %s',
    async (status) => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status })
        .expect(200);
      expect(updateMany.mock.calls[0][0].data).toMatchObject({
        status,
        updatedAt: expect.any(Date),
      });
    },
  );

  it.each([
    { nestedItem: [] },
    { nestedItem: [{ description: 'Produto', price: '1.00' }] },
  ])(
    'rejects a nested array as an item in PATCH before calling Prisma: $nestedItem',
    async ({ nestedItem }) => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [nestedItem] })
        .expect(400);
      expect(transaction).not.toHaveBeenCalled();
      expect(findFirst).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
      expect(itemDeleteMany).not.toHaveBeenCalled();
      expect(itemCreateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { customer: {} },
    { deliveryAddress: {} },
    { customer: null },
    { status: null },
    { orderNumber: null },
    { expectedDeliveryDate: null },
    { customer: { name: null } },
    { customer: { name: 'Valid', document: null } },
    { deliveryAddress: { street: null } },
    { items: null },
    { items: [] },
    { items: [{ description: 'Item', price: null }] },
    { items: [{ description: 'Item', price: '-1.00' }] },
    { items: [{ description: 'Item', price: '1.001' }] },
    { expectedDeliveryDate: '2026-02-29' },
    { status: 'UNKNOWN' },
    { unknown: true },
    { customer: { name: 'Valid', unknown: true } },
  ])('rejects invalid patch payload %j before calling Prisma', async (body) => {
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(400);
    expect(transaction).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing update and 409 for an order number conflict', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DELIVERED' })
      .expect(404);
    updateMany.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['order_number'] },
    });
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: 'ORD-DUPLICATE' })
      .expect(409);
  });

  it('soft deletes with 204 and returns 404 on a repeated delete', async () => {
    await request(app.getHttpServer())
      .delete(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)
      .expect('');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: orderId, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    updateMany.mockResolvedValueOnce({ count: 0 });
    await request(app.getHttpServer())
      .delete(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it.each([
    ['PATCH', `/orders/${orderId}`, { status: 'PROCESSING' }],
    ['DELETE', `/orders/${orderId}`, undefined],
  ])('rejects malformed UUID for %s', async (method, path, body) => {
    const endpoint = request(app.getHttpServer());
    if (method === 'PATCH') {
      await endpoint
        .patch('/orders/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400);
    } else {
      await endpoint
        .delete('/orders/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    }
  });

  it('returns 404 when the order does not exist or is deleted', async () => {
    findFirst.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 400 for a malformed UUID', async () => {
    await request(app.getHttpServer())
      .get('/orders/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it.each([
    ['POST', '/orders', input],
    ['GET', '/orders', undefined],
    ['GET', `/orders/${orderId}`, undefined],
    ['PATCH', `/orders/${orderId}`, { status: 'PROCESSING' }],
    ['DELETE', `/orders/${orderId}`, undefined],
  ])('requires a valid bearer token for %s %s', async (method, path, body) => {
    const unauthenticated = request(app.getHttpServer());
    if (method === 'POST') {
      await unauthenticated.post(path).send(body).expect(401);
    } else if (method === 'PATCH') {
      await unauthenticated.patch(path).send(body).expect(401);
    } else if (method === 'DELETE') {
      await unauthenticated.delete(path).expect(401);
    } else {
      await unauthenticated.get(path).expect(401);
    }
  });

  it.each([
    ['POST', '/orders', input],
    ['GET', '/orders', undefined],
    ['GET', `/orders/${orderId}`, undefined],
    ['PATCH', `/orders/${orderId}`, { status: 'PROCESSING' }],
    ['DELETE', `/orders/${orderId}`, undefined],
  ])(
    'rejects an invalid bearer token for %s %s',
    async (method, path, body) => {
      const endpoint = request(app.getHttpServer());
      if (method === 'POST') {
        await endpoint
          .post(path)
          .set('Authorization', 'Bearer invalid-token')
          .send(body)
          .expect(401);
      } else if (method === 'PATCH') {
        await endpoint
          .patch(path)
          .set('Authorization', 'Bearer invalid-token')
          .send(body)
          .expect(401);
      } else if (method === 'DELETE') {
        await endpoint
          .delete(path)
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      } else {
        await endpoint
          .get(path)
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      }
    },
  );
});
