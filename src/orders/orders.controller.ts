import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateOrderDto } from './order.dto.js';
import { ListOrdersQueryDto } from './list-orders-query.dto.js';
import { UpdateOrderDto } from './update-order.dto.js';
import { OrdersService } from './orders.service.js';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  orderListResponseSchema,
  orderResponseSchema,
} from '../swagger.schemas.js';

@ApiTags('Pedidos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido ou expirado.',
})
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Criar pedido com itens' })
  @ApiBody({
    type: CreateOrderDto,
    examples: {
      exemplo: {
        summary: 'Pedido fictício',
        value: {
          orderNumber: 'PEDIDO-FICTICIO-001',
          expectedDeliveryDate: '2026-12-31',
          customer: { name: 'Cliente Fictício', document: 'DOC-DEMO-001' },
          deliveryAddress: {
            street: 'Rua Exemplo',
            number: '10',
            neighborhood: 'Bairro Exemplo',
            city: 'Cidade Fictícia',
            state: 'SP',
            postalCode: '00000-000',
            country: 'BR',
          },
          items: [{ description: 'Produto fictício', price: '12.30' }],
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Pedido criado.',
    schema: orderResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'Corpo inválido.' })
  @ApiConflictResponse({ description: 'Número de pedido já utilizado.' })
  create(@Body() input: CreateOrderDto) {
    return this.ordersService.create(input);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar e filtrar pedidos',
    description:
      'Filtros combinados com AND; o período usa createdAt em UTC. Páginas fora do intervalo retornam data vazia; sem resultados totalPages é 0.',
  })
  @ApiOkResponse({
    description: 'Pedidos e paginação.',
    schema: orderListResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'Filtro ou paginação inválidos.' })
  findMany(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findMany(query);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar parcialmente um pedido',
    description:
      'Campos omitidos são preservados. Se items for enviado, substitui integralmente os itens; somente deliveryAddress.complement aceita null.',
  })
  @ApiBody({
    type: UpdateOrderDto,
    examples: {
      parcial: {
        summary: 'Atualizar status e substituir itens',
        value: {
          status: 'PROCESSING',
          deliveryAddress: { complement: null },
          items: [{ description: 'Novo produto fictício', price: '12.30' }],
        },
      },
    },
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Identificador do pedido.',
    example: 'c0290cbd-33d9-44bb-9bad-6d194e0c2f86',
  })
  @ApiOkResponse({
    description: 'Pedido atualizado.',
    schema: orderResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'UUID ou corpo inválido.' })
  @ApiNotFoundResponse({ description: 'Pedido inexistente ou excluído.' })
  @ApiConflictResponse({ description: 'Número de pedido já utilizado.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateOrderDto,
  ) {
    if (!Object.values(input).some((field) => field !== undefined)) {
      throw new BadRequestException('At least one editable field is required.');
    }
    return this.ordersService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir pedido logicamente' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Identificador do pedido.',
    example: 'c0290cbd-33d9-44bb-9bad-6d194e0c2f86',
  })
  @ApiNoContentResponse({
    description: 'Pedido excluído logicamente; resposta sem corpo.',
  })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiNotFoundResponse({ description: 'Pedido inexistente ou já excluído.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.remove(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar pedido por ID' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Identificador do pedido.',
    example: 'c0290cbd-33d9-44bb-9bad-6d194e0c2f86',
  })
  @ApiOkResponse({
    description: 'Pedido encontrado.',
    schema: orderResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiNotFoundResponse({ description: 'Pedido inexistente ou excluído.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.findOne(id);
  }
}
