import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260811170000_add_server_entity/migration.sql'),
  'utf8',
);
const nameClaimsMigration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260811180000_add_server_name_claims/migration.sql'),
  'utf8',
);
const removeCategorySortOrderMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260812170000_remove_category_sort_order/migration.sql',
  ),
  'utf8',
);

test('server expansion migration validates ambiguity and backfills every non-DM group', () => {
  assert.match(migration, /multiple Category rows normalize to the same name/);
  assert.match(migration, /UPDATE "Group" channel[\s\S]*SET "serverId" = server\."id"/);
  assert.match(migration, /"isDM" = false AND "serverId" IS NULL/);
  assert.match(migration, /FOREIGN KEY \("serverId"\) REFERENCES "Server"\("id"\)/);
  assert.doesNotMatch(migration, /DROP (TABLE "Category"|COLUMN "category")/);
});

test('server name claims reserve canonical and legacy names in one durable namespace', () => {
  assert.match(nameClaimsMigration, /CREATE TABLE "ServerNameClaim"/);
  assert.match(nameClaimsMigration, /PRIMARY KEY \("name"\)/);
  assert.match(nameClaimsMigration, /INSERT INTO "ServerNameClaim"/);
  assert.match(
    nameClaimsMigration,
    /SELECT "name", 'CANONICAL', "id",[\s\S]*FROM "Server"/,
  );
  assert.match(nameClaimsMigration, /WHERE "kind" = 'CANONICAL'/);
  assert.doesNotMatch(nameClaimsMigration, /DROP (TABLE|COLUMN)/);
});

test('legacy category sort order is removed after activity-based ordering replaced it', () => {
  assert.match(
    removeCategorySortOrderMigration,
    /ALTER TABLE "Category" DROP COLUMN IF EXISTS "sortOrder"/,
  );
});
