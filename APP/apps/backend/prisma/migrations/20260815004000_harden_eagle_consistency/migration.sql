ALTER TABLE "EagleExternalAsset"
  ALTER COLUMN "metadataHash" DROP NOT NULL;

ALTER TABLE "EagleMediaJob"
  ADD COLUMN "leaseVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "EagleAssetManualTag"
  ADD COLUMN "assignedByUser" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "EagleAssetManualTagIngestion" (
  "ownerId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EagleAssetManualTagIngestion_pkey"
    PRIMARY KEY ("ownerId", "assetId", "tagId", "sourceKey")
);

CREATE INDEX "EagleAssetManualTagIngestion_ownerId_assetId_sourceKey_idx"
  ON "EagleAssetManualTagIngestion"("ownerId", "assetId", "sourceKey");

ALTER TABLE "EagleAssetManualTagIngestion"
  ADD CONSTRAINT "EagleAssetManualTagIngestion_ownerId_assetId_fkey"
  FOREIGN KEY ("ownerId", "assetId")
  REFERENCES "EagleAsset"("ownerId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EagleAssetManualTagIngestion"
  ADD CONSTRAINT "EagleAssetManualTagIngestion_ownerId_assetId_tagId_fkey"
  FOREIGN KEY ("ownerId", "assetId", "tagId")
  REFERENCES "EagleAssetManualTag"("ownerId", "assetId", "tagId")
  ON DELETE CASCADE ON UPDATE CASCADE;
