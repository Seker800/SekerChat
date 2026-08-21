import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('subscription simplification migration preserves legacy summary and link before dropping columns', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260725143000_simplify_subscription_posts/migration.sql',
    ),
    'utf8',
  );

  assert.match(migration, /UPDATE "SubscriptionPost"/);
  assert.match(migration, /"summary"/);
  assert.match(migration, /"externalUrl"/);
  assert.match(migration, /DROP COLUMN "type"/);
  assert.match(migration, /DROP COLUMN "summary"/);
  assert.match(migration, /DROP COLUMN "externalUrl"/);
  assert.match(migration, /DROP TYPE "SubscriptionPostType"/);
});

test('article confirmation cutover only clears legacy read rows and starts recipients unconfirmed', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260811190000_article_read_confirmation/migration.sql',
    ),
    'utf8',
  );

  assert.match(migration, /CREATE TABLE "SubscriptionPostRecipient"/);
  assert.match(migration, /INSERT INTO "SubscriptionPostRecipient"/);
  assert.match(migration, /"confirmedAt"\)\s+SELECT[\s\S]+NULL/);
  assert.match(migration, /DELETE FROM "SubscriptionReadState"/);
  assert.doesNotMatch(migration, /DELETE FROM "SubscriptionPost"/);
  assert.doesNotMatch(migration, /DELETE FROM "SubscriptionAttachment"/);
  assert.doesNotMatch(migration, /DELETE FROM "SubscriptionAuditLog"/);
});

test('article author recipient backfill adds every published article author as unconfirmed', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260811203000_include_article_authors_as_recipients/migration.sql',
    ),
    'utf8',
  );

  assert.match(migration, /INSERT INTO "SubscriptionPostRecipient"/);
  assert.match(migration, /post\."authorId"/);
  assert.match(migration, /post\."status" = 'PUBLISHED'/);
  assert.match(migration, /NULL/);
  assert.match(migration, /ON CONFLICT \("postId", "userId"\) DO NOTHING/);
  assert.doesNotMatch(migration, /DELETE FROM/);
});

test('subscription attachment usage migration classifies existing body images without losing files', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260811232000_classify_subscription_attachments/migration.sql',
    ),
    'utf8',
  );

  assert.match(migration, /CREATE TYPE "SubscriptionAttachmentUsage"/);
  assert.match(migration, /ADD COLUMN "usage"/);
  assert.match(migration, /DEFAULT 'DOWNLOADABLE_FILE'/);
  assert.match(migration, /attachment:\/\//);
  assert.match(migration, /INLINE_IMAGE/);
  assert.doesNotMatch(migration, /DELETE FROM/);
});
