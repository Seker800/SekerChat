ALTER TABLE "EagleAssetColorAnalysis"
ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT false;

UPDATE "EagleAssetColorAnalysis" AS analysis
SET "isCurrent" = true
WHERE NOT EXISTS (
  SELECT 1
  FROM "EagleAssetColorAnalysis" AS newer
  WHERE newer."assetId" = analysis."assetId"
    AND (
      newer."assetRevision" > analysis."assetRevision"
      OR (
        newer."assetRevision" = analysis."assetRevision"
        AND (
          newer."createdAt" > analysis."createdAt"
          OR (newer."createdAt" = analysis."createdAt" AND newer."id" > analysis."id")
        )
      )
    )
);

CREATE INDEX "EagleAssetColorAnalysis_ownerId_processorVersion_isCurrent_status_idx"
ON "EagleAssetColorAnalysis"("ownerId", "processorVersion", "isCurrent", "status");

CREATE UNIQUE INDEX "EagleAssetColorAnalysis_one_current_per_asset_idx"
ON "EagleAssetColorAnalysis"("assetId")
WHERE "isCurrent" = true;

CREATE INDEX "EagleAssetColorSwatch_ownerId_labL_idx"
ON "EagleAssetColorSwatch"("ownerId", "labL");
