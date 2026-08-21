import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(resolve(appRoot, '../.github/workflows/ci.yml'), 'utf8');
const playwrightConfig = readFileSync(resolve(appRoot, 'playwright.config.ts'), 'utf8');
const migrationsJob = workflow.match(
  /\n {2}migrations:\n([\s\S]*?)(?=\n {2}[a-zA-Z0-9_-]+:\n|$)/,
)?.[1];

assert.ok(migrationsJob, 'CI must define a migrations job.');
assert.match(
  migrationsJob,
  /TEST_DATABASE_URL:\s*postgresql:\/\//,
  'The migrations job must provide a real PostgreSQL TEST_DATABASE_URL.',
);
assert.match(
  migrationsJob,
  /npm run test:integration --workspace @sekerchat\/backend/,
  'The migrations job must execute backend PostgreSQL integration tests.',
);
assert.match(
  playwrightConfig,
  /testIgnore:\s*\[[^\]]*\*\.live\.spec\.ts[^\]]*\]/,
  'The default mocked Playwright suite must exclude live-stack specs.',
);
console.log('CI migration and Playwright isolation contracts are present.');
