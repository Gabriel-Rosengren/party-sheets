// Starts the API for end-to-end tests on its own port and a throwaway database, so it can
// run next to `npm run dev` without touching dev.db.
import { execSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'server');
const env = {
  ...process.env,
  // 'test' disables the login rate limiter; e2e registers many accounts quickly.
  NODE_ENV: 'test',
  PORT: process.env.E2E_API_PORT ?? '3101',
  DATABASE_URL: 'file:./e2e.db',
  JWT_SECRET: 'e2e-secret-that-is-definitely-longer-than-32-chars',
  CLIENT_ORIGIN: process.env.E2E_WEB_URL ?? 'http://localhost:5174',
};

for (const file of ['e2e.db', 'e2e.db-journal']) rmSync(join(serverDir, file), { force: true });
execSync('npx prisma migrate deploy', { cwd: serverDir, env, stdio: 'inherit' });

const api = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: serverDir,
  env,
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => api.kill(signal));
api.on('exit', (code) => process.exit(code ?? 0));
