import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateOrderDto } from './order.dto.js';
import type { ListOrdersQueryDto } from './list-orders-query.dto.js';
import { toOrderResponse, type OrderResponse } from './order-response.js';

function isOrderNumberUniqueViolation(error: unknown): boolean {
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
  const allowedTargets = new Set([
    'orderNumber',
    'order_number',
    'orders_order_number_key',
  ]);
  const directTarget = Array.isArray(target)
    ? target.length === 1 && allowedTargets.has(String(target[0]))
    : typeof target === 'string' && allowedTargets.has(target);
  const adapterIndex =
    candidate.meta?.driverAdapterError?.cause?.constraint?.index;
  return directTarget || adapterIndex === 'orders_order_number_key';
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderDto): Promise<OrderResponse> {
    try {
      const order = await this.prisma.order.create({
        data: {
          orderNumber: input.orderNumber,
          status: 'PENDING',
          expectedDeliveryDate: parseDateOnly(input.expectedDeliveryDate),
          customerName: input.customer.name,
          customerDocument: input.customer.document,
          deliveryStreet: input.deliveryAddress.street,
          deliveryNumber: input.deliveryAddress.number,
          deliveryComplement: input.deliveryAddress.complement ?? null,
          deliveryNeighborhood: input.deliveryAddress.neighborhood,
          deliveryCity: input.deliveryAddress.city,
          deliveryState: input.deliveryAddress.state,
          deliveryPostalCode: input.deliveryAddress.postalCode,
          deliveryCountry: input.deliveryAddress.country,
          items: {
            create: input.items.map((item) => ({
              description: item.description,
              price: item.price,
            })),
          },
        },
        include: { items: true },
      });
      return toOrderResponse(order);
    } catch (error) {
      if (isOrderNumberUniqueViolation(error)) {
        throw new ConflictException(
          'An order with this orderNumber already exists.',
        );
      }
      throw error;
    }
  }

  async findOne(id: string): Promise<OrderResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found.');
    return toOrderResponse(order);
  }

  async findMany(query: ListOrdersQueryDto) {
    const clauses: Prisma.OrderWhereInput[] = [];
    if (query.orderNumber !== undefined) {
      clauses.push({ orderNumber: query.orderNumber });
    }
    if (query.status !== undefined) clauses.push({ status: query.status });

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.startDate !== undefined) {
      createdAt.gte = parseDateOnly(query.startDate);
    }
    if (query.endDate !== undefined) {
      const exclusiveEnd = parseDateOnly(query.endDate);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      createdAt.lt = exclusiveEnd;
    }
    if (query.startDate !== undefined || query.endDate !== undefined) {
      clauses.push({ createdAt });
    }

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(clauses.length > 0 ? { AND: clauses } : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map(toOrderResponse),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }
}
