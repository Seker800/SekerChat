-- CreateEnum
CREATE TYPE "EagleAssetLifecycleStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "EagleRenditionKind" AS ENUM ('THUMBNAIL', 'PREVIEW', 'POSTER');

-- CreateEnum
CREATE TYPE "EagleRenditionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "EagleAiAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EagleAiTagStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'REJECTED');

-- CreateEnum
CREATE TYPE "EagleMediaJobKind" AS ENUM ('GENERATE_THUMBNAIL', 'GENERATE_PREVIEW', 'PROBE_MEDIA', 'PURGE_ASSET');

-- CreateEnum
CREATE TYPE "EagleMediaJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "EagleAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedDisplayName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "originalObjectKey" TEXT NOT NULL,
    "lifecycleStatus" "EagleAssetLifecycleStatus" NOT NULL DEFAULT 'PROCESSING',
    "mediaErrorCode" TEXT,
    "mediaRevision" INTEGER NOT NULL DEFAULT 0,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "rating" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EagleAsset"
ADD CONSTRAINT "EagleAsset_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));

-- CreateTable
CREATE TABLE "EagleAssetRendition" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "EagleRenditionKind" NOT NULL,
    "revision" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "EagleRenditionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleAssetRendition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EagleManualTag" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleManualTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EagleAssetManualTag" (
    "ownerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EagleAssetManualTag_pkey" PRIMARY KEY ("ownerId","assetId","tagId")
);

-- CreateTable
CREATE TABLE "EagleAiAnalysisRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetRevision" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT,
    "promptVersion" TEXT NOT NULL,
    "status" "EagleAiAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleAiAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EagleAiTag" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleAiTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EagleAssetAiTag" (
    "ownerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "aiTagId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "EagleAiTagStatus" NOT NULL DEFAULT 'ACTIVE',
    "promotedManualTagId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleAssetAiTag_pkey" PRIMARY KEY ("ownerId","assetId","aiTagId","analysisRunId")
);

-- CreateTable
CREATE TABLE "EagleSmartFolder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "queryVersion" INTEGER NOT NULL DEFAULT 1,
    "queryJson" JSONB NOT NULL,
    "sortField" TEXT,
    "sortDirection" TEXT,
    "viewMode" TEXT,
    "thumbnailSize" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleSmartFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EagleSmartFolderManualTagDependency" (
    "ownerId" TEXT NOT NULL,
    "smartFolderId" TEXT NOT NULL,
    "manualTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EagleSmartFolderManualTagDependency_pkey" PRIMARY KEY ("ownerId","smartFolderId","manualTagId")
);

-- CreateTable
CREATE TABLE "EagleSmartFolderAiTagDependency" (
    "ownerId" TEXT NOT NULL,
    "smartFolderId" TEXT NOT NULL,
    "aiTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EagleSmartFolderAiTagDependency_pkey" PRIMARY KEY ("ownerId","smartFolderId","aiTagId")
);

-- CreateTable
CREATE TABLE "EagleMediaJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "EagleMediaJobKind" NOT NULL,
    "status" "EagleMediaJobStatus" NOT NULL DEFAULT 'PENDING',
    "assetRevision" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleMediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EagleAsset_originalObjectKey_key" ON "EagleAsset"("originalObjectKey");

-- CreateIndex
CREATE INDEX "EagleAsset_ownerId_deletedAt_createdAt_id_idx" ON "EagleAsset"("ownerId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "EagleAsset_ownerId_deletedAt_rating_idx" ON "EagleAsset"("ownerId", "deletedAt", "rating");

-- CreateIndex
CREATE INDEX "EagleAsset_ownerId_normalizedDisplayName_idx" ON "EagleAsset"("ownerId", "normalizedDisplayName");

-- CreateIndex
CREATE INDEX "EagleAsset_ownerId_sha256_idx" ON "EagleAsset"("ownerId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "EagleAsset_ownerId_id_key" ON "EagleAsset"("ownerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EagleAssetRendition_storageKey_key" ON "EagleAssetRendition"("storageKey");

-- CreateIndex
CREATE INDEX "EagleAssetRendition_ownerId_assetId_idx" ON "EagleAssetRendition"("ownerId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "EagleAssetRendition_assetId_kind_revision_key" ON "EagleAssetRendition"("assetId", "kind", "revision");

-- CreateIndex
CREATE INDEX "EagleManualTag_ownerId_name_idx" ON "EagleManualTag"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EagleManualTag_ownerId_normalizedName_key" ON "EagleManualTag"("ownerId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "EagleManualTag_ownerId_id_key" ON "EagleManualTag"("ownerId", "id");

-- CreateIndex
CREATE INDEX "EagleAssetManualTag_ownerId_tagId_assetId_idx" ON "EagleAssetManualTag"("ownerId", "tagId", "assetId");

-- CreateIndex
CREATE INDEX "EagleAiAnalysisRun_ownerId_assetId_assetRevision_createdAt_idx" ON "EagleAiAnalysisRun"("ownerId", "assetId", "assetRevision", "createdAt");

-- CreateIndex
CREATE INDEX "EagleAiAnalysisRun_status_createdAt_idx" ON "EagleAiAnalysisRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EagleAiAnalysisRun_ownerId_id_key" ON "EagleAiAnalysisRun"("ownerId", "id");

-- CreateIndex
CREATE INDEX "EagleAiTag_ownerId_name_idx" ON "EagleAiTag"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EagleAiTag_ownerId_normalizedName_key" ON "EagleAiTag"("ownerId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "EagleAiTag_ownerId_id_key" ON "EagleAiTag"("ownerId", "id");

-- CreateIndex
CREATE INDEX "EagleAssetAiTag_ownerId_aiTagId_assetId_idx" ON "EagleAssetAiTag"("ownerId", "aiTagId", "assetId");

-- CreateIndex
CREATE INDEX "EagleAssetAiTag_ownerId_analysisRunId_idx" ON "EagleAssetAiTag"("ownerId", "analysisRunId");

-- CreateIndex
CREATE INDEX "EagleSmartFolder_ownerId_position_id_idx" ON "EagleSmartFolder"("ownerId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EagleSmartFolder_ownerId_normalizedName_key" ON "EagleSmartFolder"("ownerId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "EagleSmartFolder_ownerId_id_key" ON "EagleSmartFolder"("ownerId", "id");

-- CreateIndex
CREATE INDEX "EagleSmartFolderManualTagDependency_ownerId_manualTagId_sma_idx" ON "EagleSmartFolderManualTagDependency"("ownerId", "manualTagId", "smartFolderId");

-- CreateIndex
CREATE INDEX "EagleSmartFolderAiTagDependency_ownerId_aiTagId_smartFolder_idx" ON "EagleSmartFolderAiTagDependency"("ownerId", "aiTagId", "smartFolderId");

-- CreateIndex
CREATE INDEX "EagleMediaJob_status_availableAt_idx" ON "EagleMediaJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "EagleMediaJob_ownerId_assetId_idx" ON "EagleMediaJob"("ownerId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "EagleMediaJob_assetId_kind_assetRevision_key" ON "EagleMediaJob"("assetId", "kind", "assetRevision");

-- AddForeignKey
ALTER TABLE "EagleAsset" ADD CONSTRAINT "EagleAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAssetRendition" ADD CONSTRAINT "EagleAssetRendition_ownerId_assetId_fkey" FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleManualTag" ADD CONSTRAINT "EagleManualTag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAssetManualTag" ADD CONSTRAINT "EagleAssetManualTag_ownerId_assetId_fkey" FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAssetManualTag" ADD CONSTRAINT "EagleAssetManualTag_ownerId_tagId_fkey" FOREIGN KEY ("ownerId", "tagId") REFERENCES "EagleManualTag"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAiAnalysisRun" ADD CONSTRAINT "EagleAiAnalysisRun_ownerId_assetId_fkey" FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAiTag" ADD CONSTRAINT "EagleAiTag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAssetAiTag" ADD CONSTRAINT "EagleAssetAiTag_ownerId_assetId_fkey" FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAssetAiTag" ADD CONSTRAINT "EagleAssetAiTag_ownerId_aiTagId_fkey" FOREIGN KEY ("ownerId", "aiTagId") REFERENCES "EagleAiTag"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAssetAiTag" ADD CONSTRAINT "EagleAssetAiTag_ownerId_analysisRunId_fkey" FOREIGN KEY ("ownerId", "analysisRunId") REFERENCES "EagleAiAnalysisRun"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleAssetAiTag" ADD CONSTRAINT "EagleAssetAiTag_ownerId_promotedManualTagId_fkey" FOREIGN KEY ("ownerId", "promotedManualTagId") REFERENCES "EagleManualTag"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleSmartFolder" ADD CONSTRAINT "EagleSmartFolder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleSmartFolderManualTagDependency" ADD CONSTRAINT "EagleSmartFolderManualTagDependency_ownerId_smartFolderId_fkey" FOREIGN KEY ("ownerId", "smartFolderId") REFERENCES "EagleSmartFolder"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleSmartFolderManualTagDependency" ADD CONSTRAINT "EagleSmartFolderManualTagDependency_ownerId_manualTagId_fkey" FOREIGN KEY ("ownerId", "manualTagId") REFERENCES "EagleManualTag"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleSmartFolderAiTagDependency" ADD CONSTRAINT "EagleSmartFolderAiTagDependency_ownerId_smartFolderId_fkey" FOREIGN KEY ("ownerId", "smartFolderId") REFERENCES "EagleSmartFolder"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleSmartFolderAiTagDependency" ADD CONSTRAINT "EagleSmartFolderAiTagDependency_ownerId_aiTagId_fkey" FOREIGN KEY ("ownerId", "aiTagId") REFERENCES "EagleAiTag"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleMediaJob" ADD CONSTRAINT "EagleMediaJob_ownerId_assetId_fkey" FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
