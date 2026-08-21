/*
  Warnings:

  - The `fromStatus` column on the `GroupWorkStateHistory` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `status` on the `GroupWorkState` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `toStatus` on the `GroupWorkStateHistory` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'SYSTEM';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "FileObject" ADD COLUMN     "thumbnailSize" INTEGER;

-- AlterTable
ALTER TABLE "GroupArtifact" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "lastReadEventSequence" BIGINT;

-- AlterTable
ALTER TABLE "GroupWorkState" DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "GroupWorkStateHistory" DROP COLUMN "fromStatus",
ADD COLUMN     "fromStatus" TEXT,
DROP COLUMN "toStatus",
ADD COLUMN     "toStatus" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarStorageKey" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- DropEnum
DROP TYPE "GroupWorkStatus";

-- CreateTable
CREATE TABLE "Category" (
    "name" TEXT NOT NULL,
    "avatarStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_groupId_idx" ON "Task"("groupId");

-- CreateIndex
CREATE INDEX "Group_archivedAt_updatedAt_idx" ON "Group"("archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "GroupWorkState_status_updatedAt_idx" ON "GroupWorkState"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "GroupWorkStateHistory_toStatus_createdAt_idx" ON "GroupWorkStateHistory"("toStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Message_type_createdAt_idx" ON "Message"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
