import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    // All test files share one SQLite file, so run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  },
});
