-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Server_hiddenAt_archivedAt_updatedAt_idx" ON "Server"("hiddenAt", "archivedAt", "updatedAt");
