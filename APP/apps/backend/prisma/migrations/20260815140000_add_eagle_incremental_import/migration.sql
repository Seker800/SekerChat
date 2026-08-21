CREATE TYPE "EagleImportItemAction" AS ENUM (
  'NEW',
  'UNCHANGED',
  'METADATA_UPDATE',
  'CONTENT_REPLACE',
  'SKIP_DELETED',
  'SKIP_UNSUPPORTED'
);

ALTER TABLE "EagleExternalAsset"
  ADD COLUMN "sourceContentSha256" TEXT,
  ADD COLUMN "sourceFileModifiedAt" TIMESTAMP(3),
  ADD COLUMN "sourceByteSize" BIGINT,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3);

ALTER TABLE "EagleImportRunItem"
  ADD COLUMN "action" "EagleImportItemAction",
  ADD COLUMN "contentSha256" TEXT,
  ADD COLUMN "sourceFileModifiedAt" TIMESTAMP(3);

ALTER TABLE "EagleImportRun"
  ADD COLUMN "declarationHash" TEXT;

ALTER TABLE "EagleUploadSessionState"
  ADD COLUMN "replacementAssetId" TEXT,
  ADD COLUMN "expectedContentSha256" TEXT,
  ADD COLUMN "retiredObjectKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "supersededAt" TIMESTAMP(3);

DO $$
DECLARE
  duplicate_session_id TEXT;
BEGIN
  SELECT "activeUploadSessionId"
  INTO duplicate_session_id
  FROM "EagleImportRunItem"
  WHERE "activeUploadSessionId" IS NOT NULL
  GROUP BY "activeUploadSessionId"
  HAVING COUNT(*) > 1
  ORDER BY "activeUploadSessionId"
  LIMIT 1;

  IF duplicate_session_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Cannot enforce unique Eagle import upload binding: session %s is active on multiple run items.',
        duplicate_session_id
      ),
      HINT = 'Clear or reset duplicate EagleImportRunItem.activeUploadSessionId bindings, then rerun the migration.';
  END IF;
END $$;

DROP INDEX IF EXISTS "EagleImportRunItem_activeUploadSessionId_idx";
CREATE UNIQUE INDEX "EagleImportRunItem_activeUploadSessionId_key"
  ON "EagleImportRunItem"("activeUploadSessionId");

ALTER TABLE "EagleExternalAsset"
  ADD CONSTRAINT "EagleExternalAsset_sourceContentSha256_check"
  CHECK (
    "sourceContentSha256" IS NULL
    OR "sourceContentSha256" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "EagleImportRun"
  ADD CONSTRAINT "EagleImportRun_declarationHash_check"
  CHECK (
    "declarationHash" IS NULL
    OR "declarationHash" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "EagleImportRunItem"
  ADD CONSTRAINT "EagleImportRunItem_contentSha256_check"
  CHECK (
    "contentSha256" IS NULL
    OR "contentSha256" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "EagleUploadSessionState"
  ADD CONSTRAINT "EagleUploadSessionState_expectedContentSha256_check"
  CHECK (
    "expectedContentSha256" IS NULL
    OR "expectedContentSha256" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "EagleUploadSessionState"
  ADD CONSTRAINT "EagleUploadSessionState_ownerId_replacementAssetId_fkey"
  FOREIGN KEY ("ownerId", "replacementAssetId")
  REFERENCES "EagleAsset"("ownerId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "EagleUploadSessionState_ownerId_replacementAssetId_idx"
  ON "EagleUploadSessionState"("ownerId", "replacementAssetId");

ALTER TABLE "EagleExternalAsset"
  DROP CONSTRAINT "EagleExternalAsset_ownerId_assetId_fkey",
  ADD CONSTRAINT "EagleExternalAsset_ownerId_assetId_fkey"
  FOREIGN KEY ("ownerId", "assetId")
  REFERENCES "EagleAsset"("ownerId", "id")
  ON DELETE SET NULL ("assetId")
  ON UPDATE CASCADE;

ALTER TABLE "EagleImportRunItem"
  DROP CONSTRAINT "EagleImportRunItem_ownerId_assetId_fkey",
  ADD CONSTRAINT "EagleImportRunItem_ownerId_assetId_fkey"
  FOREIGN KEY ("ownerId", "assetId")
  REFERENCES "EagleAsset"("ownerId", "id")
  ON DELETE SET NULL ("assetId")
  ON UPDATE CASCADE;
