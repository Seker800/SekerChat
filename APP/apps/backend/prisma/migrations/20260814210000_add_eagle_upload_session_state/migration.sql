CREATE TABLE "EagleUploadSessionState" (
    "uploadSessionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "duplicatePolicy" TEXT NOT NULL DEFAULT 'SKIP',
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EagleUploadSessionState_pkey" PRIMARY KEY ("uploadSessionId"),
    CONSTRAINT "EagleUploadSessionState_duplicatePolicy_check"
        CHECK ("duplicatePolicy" IN ('SKIP', 'IMPORT')),
    CONSTRAINT "EagleUploadSessionState_uploadSessionId_fkey"
        FOREIGN KEY ("uploadSessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EagleUploadSessionState_ownerId_fkey"
        FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EagleUploadSessionState_ownerId_assetId_fkey"
        FOREIGN KEY ("ownerId", "assetId") REFERENCES "EagleAsset"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "EagleUploadSessionState_ownerId_createdAt_idx"
    ON "EagleUploadSessionState"("ownerId", "createdAt");

CREATE INDEX "EagleUploadSessionState_assetId_idx"
    ON "EagleUploadSessionState"("assetId");

INSERT INTO "EagleUploadSessionState" (
    "uploadSessionId",
    "ownerId",
    "duplicatePolicy",
    "assetId",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "uploaderId",
    COALESCE("eagleDuplicatePolicy", 'SKIP'),
    "eagleAssetId",
    "createdAt",
    "updatedAt"
FROM "UploadSession"
WHERE "kind" = 'EAGLE_ASSET'
ON CONFLICT ("uploadSessionId") DO NOTHING;
