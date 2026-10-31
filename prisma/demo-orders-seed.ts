import type {
  OrderStatus,
  PrismaClient,
} from '../src/generated/prisma/client.js';

export interface DemoOrderSeed {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  expectedDeliveryDate: string;
  customer: { name: string; document: string };
  deliveryAddress: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: Array<{ description: string; price: string }>;
}

export interface DemoOrdersSeedResult {
  created: number;
  alreadyExisted: number;
  createdOrderIds: string[];
  createdOrderNumbers: string[];
}

const fakeCustomer = (number: string) => ({
  name: `Cliente Fictício ${number}`,
  document: `DOC-DEMO-${number}`,
});

const fakeAddress = (number: string) => ({
  street: 'Rua Exemplo',
  number,
  neighborhood: 'Bairro de Demonstração',
  city: 'Cidade Fictícia',
  state: 'XX',
  postalCode: `00000-${number.padStart(3, '0')}`,
  country: 'BR',
});

export const DEMO_ORDERS: readonly DemoOrderSeed[] = [
  {
    orderNumber: 'DEMO-001',
    status: 'PENDING',
    createdAt: '2026-01-05T10:00:00.000Z',
    expectedDeliveryDate: '2026-01-15',
    customer: fakeCustomer('001'),
    deliveryAddress: fakeAddress('1'),
    items: [
      { description: 'Produto demonstrativo A', price: '19.90' },
      { description: 'Produto demonstrativo B', price: '5.00' },
    ],
  },
  {
    orderNumber: 'DEMO-002',
    status: 'PROCESSING',
    createdAt: '2026-02-10T14:30:00.000Z',
    expectedDeliveryDate: '2026-02-20',
    customer: fakeCustomer('002'),
    deliveryAddress: fakeAddress('2'),
    items: [{ description: 'Caixa demonstrativa C', price: '42.50' }],
  },
  {
    orderNumber: 'DEMO-003',
    status: 'DELIVERED',
    createdAt: '2026-03-15T09:15:00.000Z',
    expectedDeliveryDate: '2026-03-17',
    customer: fakeCustomer('003'),
    deliveryAddress: fakeAddress('3'),
    items: [{ description: 'Envelope demonstrativo D', price: '8.75' }],
  },
  {
    orderNumber: 'DEMO-004',
    status: 'CANCELLED',
    createdAt: '2026-04-20T16:45:00.000Z',
    expectedDeliveryDate: '2026-04-30',
    customer: fakeCustomer('004'),
    deliveryAddress: fakeAddress('4'),
    items: [{ description: 'Item demonstrativo E', price: '120.00' }],
  },
];

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function isOrderNumberUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { index?: unknown } };
      };
    };
  };
  if (candidate.code !== 'P2002') return false;

  const target = candidate.meta?.target;
  const directTarget = Array.isArray(target)
    ? target.length === 1 &&
      ['orderNumber', 'order_number', 'orders_order_number_key'].includes(
        String(target[0]),
      )
    : typeof target === 'string' &&
      ['orderNumber', 'order_number', 'orders_order_number_key'].includes(
        target,
      );
  const adapterIndex =
    candidate.meta?.driverAdapterError?.cause?.constraint?.index;
  return directTarget || adapterIndex === 'orders_order_number_key';
}

export async function createDemoOrdersIfMissing(
  prisma: Pick<PrismaClient, 'order'>,
  orders: readonly DemoOrderSeed[] = DEMO_ORDERS,
): Promise<DemoOrdersSeedResult> {
  let created = 0;
  let alreadyExisted = 0;
  const createdOrderIds: string[] = [];
  const createdOrderNumbers: string[] = [];

  for (const order of orders) {
    const existingOrder = await prisma.order.findUnique({
      where: { orderNumber: order.orderNumber },
      select: { id: true },
    });
    if (existingOrder) {
      alreadyExisted += 1;
      continue;
    }

    const createdAt = new Date(order.createdAt);
    try {
      const createdOrder = await prisma.order.create({
        data: {
          orderNumber: order.orderNumber,
          status: order.status,
          expectedDeliveryDate: parseDateOnly(order.expectedDeliveryDate),
          customerName: order.customer.name,
          customerDocument: order.customer.document,
          deliveryStreet: order.deliveryAddress.street,
          deliveryNumber: order.deliveryAddress.number,
          deliveryComplement: order.deliveryAddress.complement ?? null,
          deliveryNeighborhood: order.deliveryAddress.neighborhood,
          deliveryCity: order.deliveryAddress.city,
          deliveryState: order.deliveryAddress.state,
          deliveryPostalCode: order.deliveryAddress.postalCode,
          deliveryCountry: order.deliveryAddress.country,
          createdAt,
          updatedAt: createdAt,
          items: {
            create: order.items.map((item) => ({
              description: item.description,
              price: item.price,
            })),
          },
        },
        select: { id: true },
      });
      created += 1;
      createdOrderIds.push(createdOrder.id);
      createdOrderNumbers.push(order.orderNumber);
    } catch (error) {
      if (!isOrderNumberUniqueConstraintError(error)) throw error;

      const concurrentOrder = await prisma.order.findUnique({
        where: { orderNumber: order.orderNumber },
        select: { id: true },
      });
      if (!concurrentOrder) throw error;
      alreadyExisted += 1;
    }
  }

  return { created, alreadyExisted, createdOrderIds, createdOrderNumbers };
}
