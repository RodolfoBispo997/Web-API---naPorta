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

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() input: CreateOrderDto) {
    return this.ordersService.create(input);
  }

  @Get()
  findMany(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findMany(query);
  }

  @Patch(':id')
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
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.remove(id);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.findOne(id);
  }
}
