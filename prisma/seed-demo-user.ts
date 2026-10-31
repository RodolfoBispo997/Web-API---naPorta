import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  DemoUserConfigurationError,
  createDemoUserIfMissing,
} from './demo-user-seed.js';

async function seedDemoUser(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;

  if (!databaseUrl) {
    throw new DemoUserConfigurationError(
      'DATABASE_URL must be configured before running the demo user seed.',
    );
  }
  if (!email) {
    throw new DemoUserConfigurationError(
      'DEMO_USER_EMAIL must be configured before running the demo user seed.',
    );
  }
  if (!password) {
    throw new DemoUserConfigurationError(
      'DEMO_USER_PASSWORD must be configured before running the demo user seed.',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const result = await createDemoUserIfMissing(prisma, email, password);
    console.info(
      result === 'created'
        ? 'Demo user created.'
        : 'Demo user already exists; existing data was not changed.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await seedDemoUser();
} catch (error) {
  if (error instanceof DemoUserConfigurationError) {
    console.error(error.message);
  } else {
    console.error(
      'Demo user seed failed. Check database availability and environment configuration.',
    );
  }
  process.exitCode = 1;
}
