import type { Prisma } from '../generated/prisma/client.js';

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true };
}>;

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: string;
  expectedDeliveryDate: string;
  customer: { name: string; document: string };
  deliveryAddress: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: Array<{ id: string; description: string; price: string }>;
  createdAt: string;
  updatedAt: string;
}

function formatDateOnly(date: Date): string {
  // Prisma's PostgreSQL adapter represents DATE as UTC midnight.
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toOrderResponse(order: OrderWithItems): OrderResponse {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    expectedDeliveryDate: formatDateOnly(order.expectedDeliveryDate),
    customer: {
      name: order.customerName,
      document: order.customerDocument,
    },
    deliveryAddress: {
      street: order.deliveryStreet,
      number: order.deliveryNumber,
      complement: order.deliveryComplement,
      neighborhood: order.deliveryNeighborhood,
      city: order.deliveryCity,
      state: order.deliveryState,
      postalCode: order.deliveryPostalCode,
      country: order.deliveryCountry,
    },
    items: order.items.map((item) => ({
      id: item.id,
      description: item.description,
      price: item.price.toFixed(2),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
