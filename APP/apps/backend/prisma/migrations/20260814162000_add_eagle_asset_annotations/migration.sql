CREATE TABLE "EagleAssetAnnotation" (
    "ownerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleAssetAnnotation_pkey" PRIMARY KEY ("ownerId", "assetId")
);

CREATE INDEX "EagleAssetAnnotation_ownerId_updatedAt_idx"
ON "EagleAssetAnnotation"("ownerId", "updatedAt");

ALTER TABLE "EagleAssetAnnotation"
ADD CONSTRAINT "EagleAssetAnnotation_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EagleAssetAnnotation"
ADD CONSTRAINT "EagleAssetAnnotation_ownerId_assetId_fkey"
FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
