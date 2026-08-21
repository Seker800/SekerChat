CREATE TYPE "EagleProcessingLane" AS ENUM ('INTERACTIVE', 'BACKGROUND', 'MAINTENANCE');
CREATE TYPE "EagleColorAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "EagleMediaJob"
ADD COLUMN "lane" "EagleProcessingLane" NOT NULL DEFAULT 'INTERACTIVE',
ADD COLUMN "processorVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN "startedAt" TIMESTAMP(3);

UPDATE "EagleMediaJob"
SET "lane" = CASE
  WHEN "kind" = 'PURGE_ASSET' THEN 'MAINTENANCE'::"EagleProcessingLane"
  WHEN "kind" = 'EXTRACT_COLOR_PALETTE' THEN 'BACKGROUND'::"EagleProcessingLane"
  ELSE 'INTERACTIVE'::"EagleProcessingLane"
END;

DROP INDEX "EagleMediaJob_assetId_kind_assetRevision_key";
DROP INDEX "EagleMediaJob_status_availableAt_idx";
CREATE UNIQUE INDEX "EagleMediaJob_assetId_kind_assetRevision_processorVersion_key"
ON "EagleMediaJob"("assetId", "kind", "assetRevision", "processorVersion");
CREATE INDEX "EagleMediaJob_status_lane_availableAt_idx"
ON "EagleMediaJob"("status", "lane", "availableAt");

CREATE TABLE "EagleAssetColorAnalysis" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "assetRevision" INTEGER NOT NULL,
  "processorVersion" TEXT NOT NULL,
  "status" "EagleColorAnalysisStatus" NOT NULL DEFAULT 'PENDING',
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EagleAssetColorAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EagleAssetColorSwatch" (
  "ownerId" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "hex" TEXT NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL,
  "labL" DOUBLE PRECISION NOT NULL,
  "labA" DOUBLE PRECISION NOT NULL,
  "labB" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EagleAssetColorSwatch_pkey" PRIMARY KEY ("analysisId", "rank")
);

CREATE TABLE "EagleProcessingWorkerHeartbeat" (
  "workerId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  "activeJobCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EagleProcessingWorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

CREATE UNIQUE INDEX "EagleAssetColorAnalysis_ownerId_id_key" ON "EagleAssetColorAnalysis"("ownerId", "id");
CREATE UNIQUE INDEX "EagleAssetColorAnalysis_assetId_assetRevision_processorVersion_key" ON "EagleAssetColorAnalysis"("assetId", "assetRevision", "processorVersion");
CREATE INDEX "EagleAssetColorAnalysis_ownerId_assetId_assetRevision_idx" ON "EagleAssetColorAnalysis"("ownerId", "assetId", "assetRevision");
CREATE INDEX "EagleAssetColorAnalysis_status_updatedAt_idx" ON "EagleAssetColorAnalysis"("status", "updatedAt");
CREATE INDEX "EagleAssetColorSwatch_ownerId_analysisId_idx" ON "EagleAssetColorSwatch"("ownerId", "analysisId");
CREATE INDEX "EagleAssetColorSwatch_hex_idx" ON "EagleAssetColorSwatch"("hex");
CREATE INDEX "EagleProcessingWorkerHeartbeat_heartbeatAt_idx" ON "EagleProcessingWorkerHeartbeat"("heartbeatAt");

ALTER TABLE "EagleAssetColorAnalysis"
ADD CONSTRAINT "EagleAssetColorAnalysis_ownerId_assetId_fkey"
FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EagleAssetColorSwatch"
ADD CONSTRAINT "EagleAssetColorSwatch_ownerId_analysisId_fkey"
FOREIGN KEY ("ownerId", "analysisId") REFERENCES "EagleAssetColorAnalysis"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
