import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('PresenceLog is created before later migrations alter or backfill it', () => {
  const migrationsRoot = join(process.cwd(), 'prisma', 'migrations');
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      sql: readFileSync(join(migrationsRoot, entry.name, 'migration.sql'), 'utf8'),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const createIndex = migrations.findIndex(({ sql }) => /CREATE TABLE(?: IF NOT EXISTS)? "PresenceLog"/.test(sql));
  const firstUseIndex = migrations.findIndex(({ sql }) => /(?:ALTER TABLE|UPDATE) "PresenceLog"/.test(sql));

  assert.notEqual(createIndex, -1, 'migration history must create PresenceLog');
  assert.notEqual(firstUseIndex, -1, 'test fixture must include a later PresenceLog migration');
  assert.ok(createIndex < firstUseIndex, 'PresenceLog must be created before it is altered or backfilled');
});
