CREATE TYPE "EagleExternalProvider" AS ENUM ('EAGLE_APP');
CREATE TYPE "EagleImportRunStatus" AS ENUM ('DRAFT', 'PREFLIGHTED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');
CREATE TYPE "EagleImportItemStatus" AS ENUM ('STAGED', 'UPLOADING', 'FINALIZING', 'IMPORTED', 'SKIPPED', 'FAILED', 'CANCELLED');

ALTER TABLE "EagleAsset"
    ADD COLUMN "libraryAddedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "EagleAsset" SET "libraryAddedAt" = "createdAt";

ALTER TABLE "EagleManualTagGroup"
    ADD COLUMN "description" TEXT;

CREATE TABLE "EagleExternalLibrary" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" "EagleExternalProvider" NOT NULL DEFAULT 'EAGLE_APP',
    "externalLibraryId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sourceModifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EagleExternalLibrary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EagleExternalAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "externalLibraryId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "assetId" TEXT,
    "sourceImportedAt" TIMESTAMP(3),
    "sourceModifiedAt" TIMESTAMP(3),
    "metadataVersion" INTEGER NOT NULL DEFAULT 1,
    "metadataHash" TEXT NOT NULL,
    "lastImportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EagleExternalAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EagleImportRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "externalLibraryId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "manifestVersion" INTEGER NOT NULL,
    "status" "EagleImportRunStatus" NOT NULL DEFAULT 'DRAFT',
    "declaredItemCount" INTEGER NOT NULL DEFAULT 0,
    "declaredByteSize" BIGINT NOT NULL DEFAULT 0,
    "stagedItemCount" INTEGER NOT NULL DEFAULT 0,
    "importedItemCount" INTEGER NOT NULL DEFAULT 0,
    "skippedItemCount" INTEGER NOT NULL DEFAULT 0,
    "failedItemCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EagleImportRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EagleImportManifestChunk" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "chunkKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "acceptedItemCount" INTEGER NOT NULL,
    "skippedItemCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EagleImportManifestChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EagleImportRunItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "externalAssetId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "sourceImportedAt" TIMESTAMP(3),
    "sourceModifiedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "description" TEXT,
    "sourceUrl" TEXT,
    "tagNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "folderSourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "metadataHash" TEXT NOT NULL,
    "warningCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "EagleImportItemStatus" NOT NULL DEFAULT 'STAGED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "assetId" TEXT,
    "activeUploadSessionId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EagleImportRunItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EagleImportRunItem_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5))
);

CREATE TABLE "EagleImportFolderDefinition" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceFolderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentSourceFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EagleImportFolderDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EagleImportTagDefinition" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "groupSourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EagleImportTagDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EagleImportTagGroupDefinition" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EagleImportTagGroupDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EagleManualTagGroupMembership" (
    "ownerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EagleManualTagGroupMembership_pkey" PRIMARY KEY ("ownerId", "tagId", "groupId")
);

CREATE UNIQUE INDEX "EagleExternalLibrary_ownerId_provider_externalLibraryId_key" ON "EagleExternalLibrary"("ownerId", "provider", "externalLibraryId");
CREATE UNIQUE INDEX "EagleExternalLibrary_ownerId_id_key" ON "EagleExternalLibrary"("ownerId", "id");
CREATE INDEX "EagleExternalLibrary_ownerId_updatedAt_idx" ON "EagleExternalLibrary"("ownerId", "updatedAt");
CREATE UNIQUE INDEX "EagleExternalAsset_ownerId_externalLibraryId_externalItemId_key" ON "EagleExternalAsset"("ownerId", "externalLibraryId", "externalItemId");
CREATE UNIQUE INDEX "EagleExternalAsset_ownerId_assetId_key" ON "EagleExternalAsset"("ownerId", "assetId");
CREATE UNIQUE INDEX "EagleExternalAsset_ownerId_id_key" ON "EagleExternalAsset"("ownerId", "id");
CREATE INDEX "EagleExternalAsset_ownerId_externalItemId_idx" ON "EagleExternalAsset"("ownerId", "externalItemId");
CREATE UNIQUE INDEX "EagleImportRun_ownerId_idempotencyKey_key" ON "EagleImportRun"("ownerId", "idempotencyKey");
CREATE UNIQUE INDEX "EagleImportRun_ownerId_id_key" ON "EagleImportRun"("ownerId", "id");
CREATE INDEX "EagleImportRun_ownerId_status_updatedAt_idx" ON "EagleImportRun"("ownerId", "status", "updatedAt");
CREATE UNIQUE INDEX "EagleImportManifestChunk_runId_chunkKey_key" ON "EagleImportManifestChunk"("runId", "chunkKey");
CREATE INDEX "EagleImportManifestChunk_ownerId_runId_createdAt_idx" ON "EagleImportManifestChunk"("ownerId", "runId", "createdAt");
CREATE UNIQUE INDEX "EagleImportRunItem_runId_externalAssetId_key" ON "EagleImportRunItem"("runId", "externalAssetId");
CREATE UNIQUE INDEX "EagleImportRunItem_runId_sourceItemId_key" ON "EagleImportRunItem"("runId", "sourceItemId");
CREATE UNIQUE INDEX "EagleImportRunItem_ownerId_id_key" ON "EagleImportRunItem"("ownerId", "id");
CREATE INDEX "EagleImportRunItem_ownerId_runId_status_id_idx" ON "EagleImportRunItem"("ownerId", "runId", "status", "id");
CREATE INDEX "EagleImportRunItem_activeUploadSessionId_idx" ON "EagleImportRunItem"("activeUploadSessionId");
CREATE UNIQUE INDEX "UploadSession_uploaderId_id_key" ON "UploadSession"("uploaderId", "id");
CREATE UNIQUE INDEX "EagleImportFolderDefinition_runId_sourceFolderId_key" ON "EagleImportFolderDefinition"("runId", "sourceFolderId");
CREATE INDEX "EagleImportFolderDefinition_ownerId_runId_idx" ON "EagleImportFolderDefinition"("ownerId", "runId");
CREATE UNIQUE INDEX "EagleImportTagDefinition_runId_normalizedName_key" ON "EagleImportTagDefinition"("runId", "normalizedName");
CREATE INDEX "EagleImportTagDefinition_ownerId_runId_idx" ON "EagleImportTagDefinition"("ownerId", "runId");
CREATE UNIQUE INDEX "EagleImportTagGroupDefinition_runId_sourceGroupId_key" ON "EagleImportTagGroupDefinition"("runId", "sourceGroupId");
CREATE INDEX "EagleImportTagGroupDefinition_ownerId_runId_idx" ON "EagleImportTagGroupDefinition"("ownerId", "runId");
CREATE INDEX "EagleManualTagGroupMembership_ownerId_groupId_tagId_idx" ON "EagleManualTagGroupMembership"("ownerId", "groupId", "tagId");
CREATE INDEX "EagleAsset_ownerId_deletedAt_libraryAddedAt_id_idx" ON "EagleAsset"("ownerId", "deletedAt", "libraryAddedAt", "id");

DROP INDEX "EagleAsset_ownerId_deletedAt_createdAt_id_idx";

ALTER TABLE "EagleUploadSessionState" ADD COLUMN "importRunItemId" TEXT;
CREATE INDEX "EagleUploadSessionState_importRunItemId_idx" ON "EagleUploadSessionState"("importRunItemId");

ALTER TABLE "EagleExternalLibrary" ADD CONSTRAINT "EagleExternalLibrary_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleExternalAsset" ADD CONSTRAINT "EagleExternalAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleExternalAsset" ADD CONSTRAINT "EagleExternalAsset_ownerId_externalLibraryId_fkey" FOREIGN KEY ("ownerId", "externalLibraryId") REFERENCES "EagleExternalLibrary"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleExternalAsset" ADD CONSTRAINT "EagleExternalAsset_ownerId_assetId_fkey" FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleImportRun" ADD CONSTRAINT "EagleImportRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleImportRun" ADD CONSTRAINT "EagleImportRun_ownerId_externalLibraryId_fkey" FOREIGN KEY ("ownerId", "externalLibraryId") REFERENCES "EagleExternalLibrary"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleImportManifestChunk" ADD CONSTRAINT "EagleImportManifestChunk_ownerId_runId_fkey" FOREIGN KEY ("ownerId", "runId") REFERENCES "EagleImportRun"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EagleImportRunItem" ADD CONSTRAINT "EagleImportRunItem_ownerId_runId_fkey" FOREIGN KEY ("ownerId", "runId") REFERENCES "EagleImportRun"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EagleImportRunItem" ADD CONSTRAINT "EagleImportRunItem_ownerId_externalAssetId_fkey" FOREIGN KEY ("ownerId", "externalAssetId") REFERENCES "EagleExternalAsset"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleImportRunItem" ADD CONSTRAINT "EagleImportRunItem_ownerId_assetId_fkey" FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleImportRunItem" ADD CONSTRAINT "EagleImportRunItem_ownerId_activeUploadSessionId_fkey" FOREIGN KEY ("ownerId", "activeUploadSessionId") REFERENCES "UploadSession"("uploaderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EagleImportFolderDefinition" ADD CONSTRAINT "EagleImportFolderDefinition_ownerId_runId_fkey" FOREIGN KEY ("ownerId", "runId") REFERENCES "EagleImportRun"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EagleImportTagDefinition" ADD CONSTRAINT "EagleImportTagDefinition_ownerId_runId_fkey" FOREIGN KEY ("ownerId", "runId") REFERENCES "EagleImportRun"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EagleImportTagGroupDefinition" ADD CONSTRAINT "EagleImportTagGroupDefinition_ownerId_runId_fkey" FOREIGN KEY ("ownerId", "runId") REFERENCES "EagleImportRun"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EagleManualTagGroupMembership" ADD CONSTRAINT "EagleManualTagGroupMembership_ownerId_tagId_fkey" FOREIGN KEY ("ownerId", "tagId") REFERENCES "EagleManualTag"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EagleManualTagGroupMembership" ADD CONSTRAINT "EagleManualTagGroupMembership_ownerId_groupId_fkey" FOREIGN KEY ("ownerId", "groupId") REFERENCES "EagleManualTagGroup"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EagleUploadSessionState" ADD CONSTRAINT "EagleUploadSessionState_ownerId_importRunItemId_fkey" FOREIGN KEY ("ownerId", "importRunItemId") REFERENCES "EagleImportRunItem"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "EagleManualTagGroupMembership" ("ownerId", "tagId", "groupId", "createdAt")
SELECT "ownerId", "id", "groupId", CURRENT_TIMESTAMP
FROM "EagleManualTag"
WHERE "groupId" IS NOT NULL
ON CONFLICT DO NOTHING;
