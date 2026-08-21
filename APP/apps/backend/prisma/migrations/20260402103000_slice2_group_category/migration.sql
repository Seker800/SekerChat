-- AlterTable
ALTER TABLE "Group"
ADD COLUMN "category" TEXT NOT NULL DEFAULT '未分类';

-- CreateIndex
CREATE INDEX "Group_category_idx" ON "Group"("category");
