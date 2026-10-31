import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from './order.dto.js';

const input = {
  orderNumber: 'ORD-100',
  expectedDeliveryDate: '2026-12-31',
  customer: { name: 'Ada Lovelace', document: 'DOC-1' },
  deliveryAddress: {
    street: 'Main Street',
    number: '10',
    neighborhood: 'Center',
    city: 'Springfield',
    state: 'SP',
    postalCode: '01000-000',
    country: 'BR',
  },
  items: [
    { description: 'Widget', price: '12.3' },
    { description: 'Gadget', price: '0.00' },
  ],
} satisfies CreateOrderDto;

function makeOrder() {
  const createdAt = new Date('2026-10-31T14:00:00.000Z');
  return {
    id: 'a2fa1e3d-c590-472c-b5f3-38a3bf182a0a',
    orderNumber: input.orderNumber,
    status: 'PENDING' as const,
    expectedDeliveryDate: new Date('2026-12-31T00:00:00.000Z'),
    customerName: input.customer.name,
    customerDocument: input.customer.document,
    deliveryStreet: input.deliveryAddress.street,
    deliveryNumber: input.deliveryAddress.number,
    deliveryComplement: null,
    deliveryNeighborhood: input.deliveryAddress.neighborhood,
    deliveryCity: input.deliveryAddress.city,
    deliveryState: input.deliveryAddress.state,
    deliveryPostalCode: input.deliveryAddress.postalCode,
    deliveryCountry: input.deliveryAddress.country,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    items: [
      {
        id: 'item-1',
        orderId: 'a2fa1e3d-c590-472c-b5f3-38a3bf182a0a',
        description: 'Widget',
        price: new Prisma.Decimal('12.3'),
      },
      {
        id: 'item-2',
        orderId: 'a2fa1e3d-c590-472c-b5f3-38a3bf182a0a',
        description: 'Gadget',
        price: new Prisma.Decimal('0.00'),
      },
    ],
  };
}

describe('OrdersService', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const count = vi.fn();
  const updateMany = vi.fn();
  const itemDeleteMany = vi.fn();
  const itemCreateMany = vi.fn();
  const transactionClient = {
    order: { updateMany, findFirst },
    orderItem: { deleteMany: itemDeleteMany, createMany: itemCreateMany },
  };
  const transaction = vi.fn(
    async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
  let service: OrdersService;

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(makeOrder());
    findFirst.mockResolvedValue(makeOrder());
    findMany.mockResolvedValue([makeOrder()]);
    count.mockResolvedValue(1);
    updateMany.mockResolvedValue({ count: 1 });
    itemDeleteMany.mockResolvedValue({ count: 2 });
    itemCreateMany.mockResolvedValue({ count: 2 });
    transaction.mockImplementation(
      async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    );
    service = new OrdersService({
      order: { create, findFirst, findMany, count, updateMany },
      $transaction: transaction,
    } as unknown as PrismaService);
  });

  it('creates an order and multiple items in one nested write without number conversion', async () => {
    const response = await service.create(input);
    const createArgument = create.mock.calls[0][0];

    expect(createArgument.data.status).toBe('PENDING');
    expect(createArgument.data.expectedDeliveryDate.toISOString()).toBe(
      '2026-12-31T00:00:00.000Z',
    );
    expect(createArgument.data.items.create).toEqual([
      { description: 'Widget', price: '12.3' },
      { description: 'Gadget', price: '0.00' },
    ]);
    expect(createArgument.include).toEqual({ items: true });
    expect(response.items.map(({ price }) => price)).toEqual(['12.30', '0.00']);
    expect(response.expectedDeliveryDate).toBe('2026-12-31');
  });

  it('maps only the order number unique constraint to HTTP conflict', async () => {
    create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['order_number'] },
    });
    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not treat a different unique constraint as a duplicate number', async () => {
    const error = { code: 'P2002', meta: { target: ['some_other_field'] } };
    create.mockRejectedValueOnce(error);
    await expect(service.create(input)).rejects.toBe(error);
  });

  it('recognizes the exact unique index exposed by the Prisma PostgreSQL adapter', async () => {
    create.mockRejectedValueOnce({
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { index: 'orders_order_number_key' } },
        },
      },
    });
    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not convert unrelated database errors into conflicts', async () => {
    const error = new Error('database unavailable');
    create.mockRejectedValueOnce(error);
    await expect(service.create(input)).rejects.toBe(error);
  });

  it('queries only orders that are not logically deleted', async () => {
    const response = await service.findOne(
      'a2fa1e3d-c590-472c-b5f3-38a3bf182a0a',
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'a2fa1e3d-c590-472c-b5f3-38a3bf182a0a',
        deletedAt: null,
      },
      include: { items: true },
    });
    expect(response.items).toHaveLength(2);
  });

  it('returns not found when an order is absent or deleted', async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists active orders with defaults, a shared filter, and stable pagination', async () => {
    const response = await service.findMany({ page: 1, limit: 20 });
    const where = findMany.mock.calls[0][0].where;

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      include: { items: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 20,
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(response.data).toHaveLength(1);
    expect(response.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('combines exact text, status, and UTC date boundaries with AND', async () => {
    await service.findMany({
      orderNumber: 'ORD-100',
      status: 'PROCESSING',
      startDate: '2024-02-29',
      endDate: '2024-03-01',
      page: 3,
      limit: 2,
    });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      deletedAt: null,
      AND: [
        { orderNumber: 'ORD-100' },
        { status: 'PROCESSING' },
        {
          createdAt: {
            gte: new Date('2024-02-29T00:00:00.000Z'),
            lt: new Date('2024-03-02T00:00:00.000Z'),
          },
        },
      ],
    });
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 4, take: 2 });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it.each([
    [
      'startDate only',
      { startDate: '2026-12-31' },
      {
        gte: new Date('2026-12-31T00:00:00.000Z'),
      },
    ],
    [
      'endDate only',
      { endDate: '2026-12-31' },
      {
        lt: new Date('2027-01-01T00:00:00.000Z'),
      },
    ],
  ])(
    'supports %s without local time-zone conversion',
    async (_name, filters, bounds) => {
      await service.findMany({ ...filters, page: 1, limit: 20 });
      expect(findMany.mock.calls[0][0].where.AND).toEqual([
        { createdAt: bounds },
      ]);
    },
  );

  it('returns no pages for an empty result and preserves the requested out-of-range page', async () => {
    findMany.mockResolvedValueOnce([]);
    count.mockResolvedValueOnce(0);
    await expect(service.findMany({ page: 8, limit: 5 })).resolves.toEqual({
      data: [],
      meta: { page: 8, limit: 5, total: 0, totalPages: 0 },
    });
    findMany.mockResolvedValueOnce([]);
    count.mockResolvedValueOnce(11);
    await expect(
      service.findMany({ page: 4, limit: 5 }),
    ).resolves.toMatchObject({
      data: [],
      meta: { page: 4, limit: 5, total: 11, totalPages: 3 },
    });
  });

  it('updates only supplied scalar, customer, and address fields in a transaction', async () => {
    const response = await service.update('order-id', {
      orderNumber: 'ORD-UPDATED',
      status: 'PROCESSING',
      customer: { name: 'Updated customer' },
      deliveryAddress: { complement: null, city: 'Updated city' },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'order-id', deletedAt: null },
      data: {
        updatedAt: expect.any(Date),
        orderNumber: 'ORD-UPDATED',
        status: 'PROCESSING',
        customerName: 'Updated customer',
        deliveryComplement: null,
        deliveryCity: 'Updated city',
      },
    });
    expect(itemDeleteMany).not.toHaveBeenCalled();
    expect(itemCreateMany).not.toHaveBeenCalled();
    expect(response.orderNumber).toBe('ORD-100');
  });

  it('replaces all items only when items are supplied and returns the updated relation', async () => {
    await service.update('order-id', {
      items: [{ description: 'Replacement', price: '12.30' }],
    });
    expect(updateMany.mock.calls[0][0].data).toEqual({
      updatedAt: expect.any(Date),
    });
    expect(itemDeleteMany).toHaveBeenCalledWith({
      where: { orderId: 'order-id' },
    });
    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [
        { orderId: 'order-id', description: 'Replacement', price: '12.30' },
      ],
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'order-id', deletedAt: null },
      include: { items: true },
    });
  });

  it('returns not found when a conditional update finds no active order', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.update('missing', { status: 'DELIVERED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(itemDeleteMany).not.toHaveBeenCalled();
  });

  it('maps an order number conflict on update without hiding other database errors', async () => {
    updateMany.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['order_number'] },
    });
    await expect(
      service.update('order-id', { orderNumber: 'ORD-100' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft deletes conditionally without deleting the order or its items', async () => {
    await expect(service.remove('order-id')).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'order-id', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(itemDeleteMany).not.toHaveBeenCalled();
  });

  it('returns not found when an order is already deleted', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.remove('deleted-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
