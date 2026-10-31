import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupSwagger } from '../src/swagger.js';

describe('Swagger documentation', () => {
  let app: INestApplication;
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'swagger-http-test-secret-at-least-32-bytes';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('serves the UI and a document with public login and Bearer-protected order operations', async () => {
    const ui = await request(app.getHttpServer()).get('/docs/').expect(200);
    expect(ui.text).toContain('Swagger UI');
    const yaml = await request(app.getHttpServer())
      .get('/docs-yaml')
      .expect(200);
    expect(yaml.text).toContain('openapi:');
    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(body.info.title).toBe('API naPorta');
    expect(body.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(body.paths['/auth/login'].post.security ?? []).toEqual([]);
    for (const [path, method] of [
      ['/orders', 'post'],
      ['/orders', 'get'],
      ['/orders/{id}', 'get'],
      ['/orders/{id}', 'patch'],
      ['/orders/{id}', 'delete'],
    ]) {
      expect(body.paths[path][method].security).toContainEqual({ bearer: [] });
      expect(body.paths[path][method].responses['401']).toBeDefined();
    }
    expect(body.paths['/orders'].post.responses['201']).toBeDefined();
    expect(body.paths['/orders'].post.responses['409']).toBeDefined();
    expect(body.paths['/orders'].post.responses['404']).toBeUndefined();
    expect(
      body.paths['/orders/{id}'].delete.responses['204'].content,
    ).toBeUndefined();
    expect(body.paths['/orders/{id}'].delete.responses['404']).toBeDefined();
    expect(body.paths['/orders/{id}'].delete.responses['409']).toBeUndefined();
    for (const [path, method, statuses] of [
      ['/auth/login', 'post', ['200', '400', '401']],
      ['/orders', 'post', ['201', '400', '401', '409']],
      ['/orders', 'get', ['200', '400', '401']],
      ['/orders/{id}', 'get', ['200', '400', '401', '404']],
      ['/orders/{id}', 'patch', ['200', '400', '401', '404', '409']],
      ['/orders/{id}', 'delete', ['204', '400', '401', '404']],
    ] as const) {
      expect(Object.keys(body.paths[path][method].responses).sort()).toEqual(
        [...statuses].sort(),
      );
    }
  });

  it('describes nested inputs, decimal prices, partial updates and filters', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const schemas = body.components.schemas;
    expect(schemas.CreateOrderDto.required).toEqual(
      expect.arrayContaining([
        'orderNumber',
        'expectedDeliveryDate',
        'customer',
        'deliveryAddress',
        'items',
      ]),
    );
    expect(schemas.CreateOrderDto.properties.customer.$ref).toContain(
      'CustomerDto',
    );
    expect(schemas.CreateOrderDto.properties.deliveryAddress.$ref).toContain(
      'DeliveryAddressDto',
    );
    expect(schemas.CreateOrderItemDto.properties.price).toMatchObject({
      type: 'string',
      example: '12.30',
    });
    const pricePattern = new RegExp(
      schemas.CreateOrderItemDto.properties.price.pattern,
    );
    expect(pricePattern.test('12.30')).toBe(true);
    expect(pricePattern.test('12x30')).toBe(false);
    expect(
      body.paths['/orders'].post.requestBody.content['application/json']
        .examples.exemplo.value.items[0].price,
    ).toBe('12.30');
    expect(
      body.paths['/orders/{id}'].patch.requestBody.content['application/json']
        .examples.parcial.value.deliveryAddress.complement,
    ).toBeNull();
    expect(schemas.UpdateOrderDto.required ?? []).not.toContain('items');
    expect(
      schemas.UpdateDeliveryAddressDto.properties.complement.nullable,
    ).toBe(true);
    expect(schemas.UpdateOrderDto.properties.items.description).toContain(
      'substitui',
    );
    const parameters = body.paths['/orders'].get.parameters;
    expect(
      parameters.find(
        (parameter: { name: string }) => parameter.name === 'page',
      ).schema,
    ).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 10000,
      default: 1,
    });
    expect(
      parameters.find(
        (parameter: { name: string }) => parameter.name === 'limit',
      ).schema,
    ).toMatchObject({ type: 'integer', minimum: 1, maximum: 100, default: 20 });
    expect(
      parameters.find(
        (parameter: { name: string }) => parameter.name === 'status',
      ).schema.enum,
    ).toEqual(['PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED']);
    expect(
      parameters.find(
        (parameter: { name: string }) => parameter.name === 'endDate',
      ).description,
    ).toContain('UTC');
    const response =
      body.paths['/orders'].get.responses['200'].content['application/json']
        .schema;
    expect(
      response.properties.data.items.properties.items.items.properties.price
        .type,
    ).toBe('string');
    expect(response.properties.meta.required).toEqual([
      'page',
      'limit',
      'total',
      'totalPages',
    ]);
  });
});
