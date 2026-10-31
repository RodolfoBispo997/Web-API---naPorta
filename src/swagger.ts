import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('API naPorta')
    .setDescription('Autenticação e gerenciamento de pedidos.')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  for (const name of [
    'LoginDto',
    'CreateOrderDto',
    'CustomerDto',
    'DeliveryAddressDto',
    'CreateOrderItemDto',
    'UpdateOrderDto',
    'UpdateCustomerDto',
    'UpdateDeliveryAddressDto',
  ]) {
    const schema = document.components?.schemas?.[name];
    if (schema && !('$ref' in schema)) {
      schema.additionalProperties = false;
      if (
        [
          'UpdateOrderDto',
          'UpdateCustomerDto',
          'UpdateDeliveryAddressDto',
        ].includes(name)
      ) {
        schema.minProperties = 1;
      }
    }
  }
  SwaggerModule.setup('docs', app, document);
}
