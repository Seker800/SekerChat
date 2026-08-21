import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('upload session target constraint accepts target-free album uploads', () => {
  const migrationsRoot = join(__dirname, '../../prisma/migrations');
  const migrationSql = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((directory) => readFileSync(join(migrationsRoot, directory, 'migration.sql'), 'utf8'))
    .join('\n');

  const latestConstraintDefinition = migrationSql
    .split('ADD CONSTRAINT "UploadSession_target_check"')
    .at(-1);

  assert.match(latestConstraintDefinition ?? '', /"kind"\s*=\s*'ALBUM_PHOTO'/);
  assert.match(
    latestConstraintDefinition ?? '',
    /"groupId"\s+IS\s+NULL[\s\S]*"subscriptionAttachmentId"\s+IS\s+NULL/,
  );
});
