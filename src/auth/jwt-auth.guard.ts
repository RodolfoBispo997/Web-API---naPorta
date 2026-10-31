import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtTokenService } from './jwt-token.service.js';

export interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtTokenService: JwtTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

    if (!match) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      request.user = await this.jwtTokenService.verifyAccessToken(match[1]);
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }
}
