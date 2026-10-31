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
  let service: OrdersService;

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(makeOrder());
    findFirst.mockResolvedValue(makeOrder());
    service = new OrdersService({
      order: { create, findFirst },
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
});
