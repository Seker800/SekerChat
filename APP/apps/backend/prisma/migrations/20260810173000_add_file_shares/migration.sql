CREATE TYPE "FileShareRevokedReason" AS ENUM ('MANUAL', 'CHANNEL_ARCHIVED');

CREATE TABLE "FileShare" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "publicTokenHash" TEXT NOT NULL,
    "encryptedPublicToken" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "FileShareRevokedReason",
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FileShare_fileId_key" ON "FileShare"("fileId");
CREATE UNIQUE INDEX "FileShare_publicTokenHash_key" ON "FileShare"("publicTokenHash");
CREATE INDEX "FileShare_creatorId_createdAt_idx" ON "FileShare"("creatorId", "createdAt");
CREATE INDEX "FileShare_expiresAt_idx" ON "FileShare"("expiresAt");
CREATE INDEX "FileShare_revokedAt_idx" ON "FileShare"("revokedAt");

ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
