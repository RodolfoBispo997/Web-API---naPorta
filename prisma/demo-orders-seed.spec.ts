import type { PrismaClient } from '../src/generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import { createDemoOrdersIfMissing, DEMO_ORDERS } from './demo-orders-seed.js';

function repository(findUnique = vi.fn(), create = vi.fn()) {
  return {
    order: { findUnique, create },
  } as unknown as Pick<PrismaClient, 'order'>;
}

describe('demo orders seed', () => {
  it('creates every missing demonstration order with its items in one nested write', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: 'created-order' });

    const result = await createDemoOrdersIfMissing(
      repository(findUnique, create),
    );
    expect(result).toMatchObject({ created: 4, alreadyExisted: 0 });
    expect(result.createdOrderIds).toHaveLength(4);
    expect(result.createdOrderNumbers).toEqual(
      DEMO_ORDERS.map(({ orderNumber }) => orderNumber),
    );

    expect(create).toHaveBeenCalledTimes(DEMO_ORDERS.length);
    const firstCreate = create.mock.calls[0][0];
    expect(firstCreate.data).toMatchObject({
      orderNumber: 'DEMO-001',
      status: 'PENDING',
      expectedDeliveryDate: new Date('2026-01-15T00:00:00.000Z'),
      createdAt: new Date('2026-01-05T10:00:00.000Z'),
      updatedAt: new Date('2026-01-05T10:00:00.000Z'),
      customerName: 'Cliente Fictício 001',
      customerDocument: 'DOC-DEMO-001',
    });
    expect(firstCreate.data.items.create).toEqual([
      { description: 'Produto demonstrativo A', price: '19.90' },
      { description: 'Produto demonstrativo B', price: '5.00' },
    ]);
  });

  it('does not duplicate orders on a repeated execution', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'existing-order' });
    const create = vi.fn();

    await expect(
      createDemoOrdersIfMissing(repository(findUnique, create)),
    ).resolves.toMatchObject({ created: 0, alreadyExisted: 4 });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['an existing order with edited values', { id: 'edited-order' }],
    ['an existing logically deleted order', { id: 'deleted-order' }],
  ])('preserves %s without writing to it', async (_description, existing) => {
    const findUnique = vi.fn().mockResolvedValue(existing);
    const create = vi.fn();

    await expect(
      createDemoOrdersIfMissing(repository(findUnique, create), [
        DEMO_ORDERS[0],
      ]),
    ).resolves.toMatchObject({ created: 0, alreadyExisted: 1 });
    expect(create).not.toHaveBeenCalled();
  });

  it('counts a concurrent conflict only when the exact order number constraint identifies an existing row', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'concurrent-order' });
    const create = vi.fn().mockRejectedValue({
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { index: 'orders_order_number_key' } },
        },
      },
    });

    await expect(
      createDemoOrdersIfMissing(repository(findUnique, create), [
        DEMO_ORDERS[0],
      ]),
    ).resolves.toMatchObject({ created: 0, alreadyExisted: 1 });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('propagates unrelated unique constraint and database errors', async () => {
    const unrelatedUnique = {
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { index: 'orders_another_unique_index' } },
        },
      },
    };
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockRejectedValueOnce(unrelatedUnique);

    await expect(
      createDemoOrdersIfMissing(repository(findUnique, create), [
        DEMO_ORDERS[0],
      ]),
    ).rejects.toBe(unrelatedUnique);
    expect(findUnique).toHaveBeenCalledTimes(1);

    const databaseError = new Error('database unavailable');
    create.mockRejectedValueOnce(databaseError);
    await expect(
      createDemoOrdersIfMissing(repository(findUnique, create), [
        DEMO_ORDERS[0],
      ]),
    ).rejects.toBe(databaseError);
  });
});
