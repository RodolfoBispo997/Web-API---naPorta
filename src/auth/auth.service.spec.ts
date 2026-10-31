import bcrypt from 'bcryptjs';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createDemoUserIfMissing } from '../../prisma/demo-user-seed.js';
import { loadJwtSettings } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { JwtTokenService } from './jwt-token.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const userId = '3a9ee480-e21a-496d-9ed0-8ba01d14be92';
const email = 'demo@example.test';
const password = 'Valid password without a complexity rule';
const originalJwtSecret = process.env.JWT_SECRET;
const findUnique = vi.fn();
const issueAccessToken = vi.fn();
const prisma = { user: { findUnique } } as unknown as PrismaService;
const tokenService = {
  issueAccessToken,
} as unknown as JwtTokenService;
const storedUser = { id: userId, email, passwordHash: '' };
let passwordHash: string;
let authService: AuthService;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(password, 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  storedUser.passwordHash = passwordHash;
  findUnique.mockResolvedValue(storedUser);
  issueAccessToken.mockResolvedValue('signed-token');
  authService = new AuthService(prisma, tokenService);
});

afterAll(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe('AuthService.login', () => {
  it('returns a bearer token for valid credentials and queries a normalized email', async () => {
    const result = await authService.login({
      email: '  DEMO@EXAMPLE.TEST ',
      password,
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    expect(issueAccessToken).toHaveBeenCalledWith(userId);
    expect(result).toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns the same generic authentication error for an unknown user', async () => {
    findUnique.mockResolvedValue(null);

    await expect(authService.login({ email, password })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password.',
    });
  });

  it('returns the same generic authentication error for a wrong password', async () => {
    await expect(
      authService.login({ email, password: 'wrong password' }),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password.',
    });
  });

  it('accepts passwords at the 72-byte bcrypt limit', async () => {
    const limitPassword = 'x'.repeat(72);
    storedUser.passwordHash = await bcrypt.hash(limitPassword, 4);
    await expect(
      authService.login({ email, password: limitPassword }),
    ).resolves.toMatchObject({ tokenType: 'Bearer' });
  });

  it('rejects passwords above 72 UTF-8 bytes before querying or comparing', async () => {
    await expect(
      authService.login({ email, password: 'x'.repeat(73) }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Password must be no longer than 72 UTF-8 bytes.',
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('counts UTF-8 bytes for multibyte characters', async () => {
    const password72Bytes = 'é'.repeat(36);
    const password74Bytes = 'é'.repeat(37);
    storedUser.passwordHash = await bcrypt.hash(password72Bytes, 4);
    await expect(
      authService.login({ email, password: password72Bytes }),
    ).resolves.toMatchObject({ tokenType: 'Bearer' });
    await expect(
      authService.login({ email, password: password74Bytes }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('does not authenticate a password sharing the first 72 bytes', async () => {
    const registeredPassword = 'x'.repeat(72);
    storedUser.passwordHash = await bcrypt.hash(registeredPassword, 4);
    await expect(
      authService.login({ email, password: `${registeredPassword}extra` }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts an existing password that has no complexity requirements', async () => {
    const simplePassword = 'x';
    storedUser.passwordHash = await bcrypt.hash(simplePassword, 4);

    await expect(
      authService.login({ email, password: simplePassword }),
    ).resolves.toMatchObject({ tokenType: 'Bearer' });
  });
});

describe('JWT configuration', () => {
  it('requires a secret of at least 32 bytes', () => {
    delete process.env.JWT_SECRET;
    expect(() => loadJwtSettings()).toThrow(/JWT_SECRET must be configured/);

    process.env.JWT_SECRET = 'too-short';
    expect(() => loadJwtSettings()).toThrow(/at least 32 bytes/);

    process.env.JWT_SECRET = 'a'.repeat(32);
    expect(loadJwtSettings().secret.byteLength).toBe(32);
  });
});

describe('demo user seed helper', () => {
  it('creates by normalized email when the account is missing', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: userId });
    const repository = { user: { findUnique, create } } as unknown as Pick<
      PrismaClient,
      'user'
    >;

    await expect(
      createDemoUserIfMissing(repository, ' Demo@Example.Test ', password),
    ).resolves.toBe('created');
    expect(findUnique).toHaveBeenCalledWith({
      where: { email },
      select: { id: true },
    });
    const createdHash = create.mock.calls[0][0].data.passwordHash;
    expect(create).toHaveBeenCalledWith({
      data: { email, passwordHash: createdHash },
    });
    expect(createdHash).not.toBe(password);
    expect(await bcrypt.compare(password, createdHash)).toBe(true);
  });

  it('does not modify an existing account', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: userId });
    const create = vi.fn();
    const repository = { user: { findUnique, create } } as unknown as Pick<
      PrismaClient,
      'user'
    >;
    await expect(
      createDemoUserIfMissing(repository, email, 'different seed password'),
    ).resolves.toBe('already-exists');
    expect(create).not.toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('treats an email uniqueness race as existing without updating', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: userId });
    const create = vi.fn().mockRejectedValue({
      code: 'P2002',
      meta: { target: ['email'] },
    });
    const repository = { user: { findUnique, create } } as unknown as Pick<
      PrismaClient,
      'user'
    >;
    await expect(
      createDemoUserIfMissing(repository, email, password),
    ).resolves.toBe('already-exists');
  });

  it('recognizes the email index in the Prisma PostgreSQL adapter error shape', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: userId });
    const create = vi.fn().mockRejectedValue({
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { index: 'users_email_key' } },
        },
      },
    });
    const repository = { user: { findUnique, create } } as unknown as Pick<
      PrismaClient,
      'user'
    >;
    await expect(
      createDemoUserIfMissing(repository, email, password),
    ).resolves.toBe('already-exists');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('does not hide an unrelated PostgreSQL unique index error', async () => {
    const uniqueError = {
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { index: 'users_another_unique_index' } },
        },
      },
    };
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockRejectedValue(uniqueError);
    const repository = { user: { findUnique, create } } as unknown as Pick<
      PrismaClient,
      'user'
    >;
    await expect(
      createDemoUserIfMissing(repository, email, password),
    ).rejects.toBe(uniqueError);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('propagates unrelated database errors', async () => {
    const dbError = new Error('database unavailable');
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockRejectedValue(dbError);
    const repository = { user: { findUnique, create } } as unknown as Pick<
      PrismaClient,
      'user'
    >;
    await expect(
      createDemoUserIfMissing(repository, email, password),
    ).rejects.toBe(dbError);
  });

  it('does not mistake a different unique constraint for an email race', async () => {
    const uniqueError = { code: 'P2002', meta: { target: ['someOtherField'] } };
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockRejectedValue(uniqueError);
    const repository = { user: { findUnique, create } } as unknown as Pick<
      PrismaClient,
      'user'
    >;
    await expect(
      createDemoUserIfMissing(repository, email, password),
    ).rejects.toBe(uniqueError);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid demo email or an oversized bcrypt password', async () => {
    const findUnique = vi.fn();
    const create = vi.fn();
    const repository = { user: { findUnique, create } } as unknown as Pick<
      PrismaClient,
      'user'
    >;

    await expect(
      createDemoUserIfMissing(repository, 'not-an-email', password),
    ).rejects.toThrow(/DEMO_USER_EMAIL/);
    await expect(
      createDemoUserIfMissing(repository, email, 'x'.repeat(73)),
    ).rejects.toThrow(/DEMO_USER_PASSWORD/);
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
