import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer reads .env automatically; Node's built-in loader does it here.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file (e.g. CI) — rely on the real environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
