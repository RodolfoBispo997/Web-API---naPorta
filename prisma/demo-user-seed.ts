import bcrypt from 'bcryptjs';
import { isEmail } from 'class-validator';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  isBcryptPasswordLengthValid,
  normalizeEmail,
} from '../src/auth/credentials.js';

const BCRYPT_ROUNDS = 12;

export type DemoUserSeedResult = 'created' | 'already-exists';

function isEmailUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (candidate.code !== 'P2002') return false;
  const target = candidate.meta?.target;
  return Array.isArray(target) ? target.includes('email') : target === 'email';
}

export class DemoUserConfigurationError extends Error {}

export async function createDemoUserIfMissing(
  prisma: Pick<PrismaClient, 'user'>,
  rawEmail: string,
  password: string,
): Promise<DemoUserSeedResult> {
  const email = normalizeEmail(rawEmail);
  if (email.length > 320 || !isEmail(email)) {
    throw new DemoUserConfigurationError(
      'DEMO_USER_EMAIL must be a valid email address (maximum 320 characters).',
    );
  }

  if (!password || !isBcryptPasswordLengthValid(password)) {
    throw new DemoUserConfigurationError(
      'DEMO_USER_PASSWORD must be set and no longer than 72 UTF-8 bytes.',
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) return 'already-exists';

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    await prisma.user.create({ data: { email, passwordHash } });
    return 'created';
  } catch (error) {
    if (!isEmailUniqueConstraintError(error)) throw error;

    const concurrentUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (concurrentUser) return 'already-exists';
    throw error;
  }
}
