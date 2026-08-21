import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260813170000_add_album_media_jobs/migration.sql'),
  'utf8',
);
const countMigration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260813171000_sync_album_tag_counts/migration.sql'),
  'utf8',
);

test('album media migration creates recoverable jobs and database-owned tag counts', () => {
  assert.match(migration, /CREATE TABLE "AlbumMediaJob"/);
  assert.match(migration, /AlbumMediaJob_status_availableAt_idx/);
  assert.match(countMigration, /syncAlbumTagPhotoCountFromRelation/);
  assert.match(countMigration, /syncAlbumTagPhotoCountFromPhotoState/);
  assert.match(
    migration,
    /WHERE photo\."deletedAt" IS NULL AND photo\."thumbnailStorageKey" IS NULL/,
  );
  assert.match(migration, /photo\."deletedAt" \+ INTERVAL '7 days'/);
});
