import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260813190000_add_album_update_state/migration.sql'),
  'utf8',
);

test('album update state migration preserves history and baselines existing users', () => {
  assert.match(migration, /ROW_NUMBER\(\) OVER \(ORDER BY "createdAt", "id"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "AlbumPhoto_revision_key"/);
  assert.match(migration, /INSERT INTO "AlbumState"/);
  assert.match(migration, /INSERT INTO "AlbumReadState"/);
  assert.match(migration, /SELECT "id", \(SELECT "revision" FROM "AlbumState"/);
  assert.match(migration, /CHECK \("id" = 1\)/);
});
