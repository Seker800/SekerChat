ALTER TABLE "UploadSession"
ADD COLUMN "finalizationMode" TEXT;

CREATE TABLE "UploadFinalizationJob" (
  "id" TEXT NOT NULL,
  "uploadSessionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UploadFinalizationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadFinalizationJob_uploadSessionId_key"
ON "UploadFinalizationJob"("uploadSessionId");

CREATE INDEX "UploadFinalizationJob_status_availableAt_createdAt_idx"
ON "UploadFinalizationJob"("status", "availableAt", "createdAt");

CREATE INDEX "UploadFinalizationJob_status_lockedAt_idx"
ON "UploadFinalizationJob"("status", "lockedAt");

ALTER TABLE "UploadFinalizationJob"
ADD CONSTRAINT "UploadFinalizationJob_uploadSessionId_fkey"
FOREIGN KEY ("uploadSessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
