import type { SchemaObject } from '@nestjs/swagger';

const customer: SchemaObject = {
  type: 'object',
  required: ['name', 'document'],
  properties: {
    name: { type: 'string', example: 'Cliente Fictício' },
    document: { type: 'string', example: 'DOC-DEMO-001' },
  },
};

const address: SchemaObject = {
  type: 'object',
  required: [
    'street',
    'number',
    'complement',
    'neighborhood',
    'city',
    'state',
    'postalCode',
    'country',
  ],
  properties: {
    street: { type: 'string', example: 'Rua Exemplo' },
    number: { type: 'string', example: '10' },
    complement: { type: 'string', nullable: true, example: null },
    neighborhood: { type: 'string', example: 'Bairro Exemplo' },
    city: { type: 'string', example: 'Cidade Fictícia' },
    state: { type: 'string', example: 'SP' },
    postalCode: { type: 'string', example: '00000-000' },
    country: { type: 'string', example: 'BR' },
  },
};

export const orderResponseSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'orderNumber',
    'status',
    'expectedDeliveryDate',
    'customer',
    'deliveryAddress',
    'items',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      example: 'c0290cbd-33d9-44bb-9bad-6d194e0c2f86',
    },
    orderNumber: { type: 'string', example: 'DEMO-001' },
    status: {
      type: 'string',
      enum: ['PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED'],
      example: 'PENDING',
    },
    expectedDeliveryDate: {
      type: 'string',
      format: 'date',
      example: '2026-12-31',
    },
    customer,
    deliveryAddress: address,
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'description', 'price'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            example: 'c0290cbd-33d9-44bb-9bad-6d194e0c2f87',
          },
          description: { type: 'string', example: 'Produto fictício' },
          price: {
            type: 'string',
            example: '12.30',
            description: 'Valor decimal com duas casas.',
          },
        },
      },
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      example: '2026-01-05T10:00:00.000Z',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
      example: '2026-01-05T10:00:00.000Z',
    },
  },
};

export const orderListResponseSchema: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: orderResponseSchema },
    meta: {
      type: 'object',
      required: ['page', 'limit', 'total', 'totalPages'],
      properties: {
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 1 },
        totalPages: { type: 'integer', example: 1 },
      },
    },
  },
};

export const loginResponseSchema: SchemaObject = {
  type: 'object',
  required: ['accessToken', 'tokenType', 'expiresIn'],
  properties: {
    accessToken: {
      type: 'string',
      description: 'JWT emitido após autenticação.',
    },
    tokenType: { type: 'string', enum: ['Bearer'] },
    expiresIn: { type: 'integer', example: 900 },
  },
};
