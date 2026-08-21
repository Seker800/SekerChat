-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('CHAT_ATTACHMENT', 'ARTIFACT');

-- CreateEnum
CREATE TYPE "UploadSessionStatus" AS ENUM ('INITIATED', 'COMPLETED', 'ABORTED');

-- AlterTable
ALTER TABLE "FileObject"
  ALTER COLUMN "size" TYPE BIGINT USING "size"::BIGINT;

-- AlterTable
ALTER TABLE "GroupArtifact"
  ALTER COLUMN "size" TYPE BIGINT USING "size"::BIGINT;

-- CreateTable
CREATE TABLE "UploadSession" (
  "id" TEXT NOT NULL,
  "kind" "UploadKind" NOT NULL,
  "status" "UploadSessionStatus" NOT NULL DEFAULT 'INITIATED',
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "multipartUploadId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "abortedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_objectKey_key" ON "UploadSession"("objectKey");

-- CreateIndex
CREATE INDEX "UploadSession_groupId_createdAt_idx" ON "UploadSession"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadSession_uploaderId_createdAt_idx" ON "UploadSession"("uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadSession_status_createdAt_idx" ON "UploadSession"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "UploadSession"
  ADD CONSTRAINT "UploadSession_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession"
  ADD CONSTRAINT "UploadSession_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
