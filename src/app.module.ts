import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({ imports: [AuthModule, OrdersModule] })
export class AppModule {}
