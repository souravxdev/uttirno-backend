import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer auto-loads .env; Node ≥20.12 can, natively.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the ambient environment (e.g. CI).
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node -T prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
