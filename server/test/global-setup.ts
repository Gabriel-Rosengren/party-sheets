import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST_DB = fileURLToPath(new URL('../test.db', import.meta.url));

/**
 * Starts every run from a brand-new throwaway database: delete the file, then apply the
 * migrations to a fresh one. Never points at dev.db.
 */
export default function setup() {
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-journal`, { force: true });
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  });
}
