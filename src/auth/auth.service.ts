import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants.js';
import { isBcryptPasswordLengthValid, normalizeEmail } from './credentials.js';
import { JwtTokenService } from './jwt-token.service.js';
import { LoginDto } from './login.dto.js';

const BCRYPT_ROUNDS = 12;
const dummyPasswordHash = bcrypt.hash(
  randomBytes(32).toString('base64url'),
  BCRYPT_ROUNDS,
);

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async login(credentials: LoginDto): Promise<LoginResponse> {
    if (!isBcryptPasswordLengthValid(credentials.password)) {
      throw new BadRequestException(
        'Password must be no longer than 72 UTF-8 bytes.',
      );
    }

    const email = normalizeEmail(credentials.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    const hashToCompare = user?.passwordHash ?? (await dummyPasswordHash);
    const passwordMatches = await bcrypt
      .compare(credentials.password, hashToCompare)
      .catch(() => false);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return {
      accessToken: await this.jwtTokenService.issueAccessToken(user.id),
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
