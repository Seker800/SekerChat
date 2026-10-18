import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const local = new URL(process.env.DATABASE_URL || '');
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(local.hostname),
  'migration check requires a local loopback database',
);
assert.notEqual(process.env.NODE_ENV, 'production');
const requireBackend = createRequire(new URL('../apps/backend/package.json', import.meta.url));
const { PrismaClient } = requireBackend('@prisma/client');
const admin = new PrismaClient();
const name = `qq_bridge_check_${randomBytes(6).toString('hex')}`;
let scratch;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  local.pathname = `/${name}`;
  const url = local.toString();
  execFileSync(
    fileURLToPath(new URL('../apps/backend/node_modules/.bin/prisma', import.meta.url)),
    ['migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    {
      cwd: fileURLToPath(new URL('../apps/backend', import.meta.url)),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    },
  );
  scratch = new PrismaClient({ datasources: { db: { url } } });
  const indexes =
    await scratch.$queryRaw`SELECT indexname FROM pg_indexes WHERE tablename = 'QqBridgeBinding' AND indexdef LIKE '%WHERE%archivedAt%IS NULL%'`;
  assert.equal(indexes.length, 2);
  assert.equal(await scratch.qqBridgeConnector.count(), 0);
  console.log(
    'Local empty-database migration check passed; both active-binding unique indexes exist.',
  );
} catch (error) {
  if (error.stdout)
    console.error(
      String(error.stdout).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted-database-url]'),
    );
  throw new Error('Local isolated migration check failed; production was not accessed.', {
    cause: error.message,
  });
} finally {
  await scratch?.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.$disconnect();
}
