import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JWT_SETTINGS, loadJwtSettings } from './auth.constants.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtTokenService } from './jwt-token.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    { provide: JWT_SETTINGS, useFactory: loadJwtSettings },
    AuthService,
    JwtAuthGuard,
    JwtTokenService,
  ],
  exports: [JwtAuthGuard, JwtTokenService],
})
export class AuthModule {}
