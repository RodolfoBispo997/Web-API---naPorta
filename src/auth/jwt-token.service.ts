import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_SETTINGS,
  type JwtSettings,
} from './auth.constants.js';

@Injectable()
export class JwtTokenService {
  constructor(@Inject(JWT_SETTINGS) private readonly settings: JwtSettings) {}

  async issueAccessToken(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.settings.secret);
  }

  async verifyAccessToken(token: string): Promise<{ id: string }> {
    const { payload } = await jwtVerify(token, this.settings.secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.exp !== 'number'
    ) {
      throw new Error('JWT is missing required claims.');
    }

    return { id: payload.sub };
  }
}
