-- AlterTable
ALTER TABLE "EagleSmartFolder"
ADD COLUMN "parentId" TEXT,
ADD COLUMN "color" TEXT;

-- CheckConstraint
ALTER TABLE "EagleSmartFolder"
ADD CONSTRAINT "EagleSmartFolder_parent_not_self_check"
CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- CheckConstraint
ALTER TABLE "EagleSmartFolder"
ADD CONSTRAINT "EagleSmartFolder_color_check"
CHECK ("color" IS NULL OR "color" ~ '^#[0-9a-f]{6}$');

-- DropIndex
DROP INDEX "EagleSmartFolder_ownerId_position_id_idx";

-- CreateIndex
CREATE INDEX "EagleSmartFolder_ownerId_parentId_position_id_idx"
ON "EagleSmartFolder"("ownerId", "parentId", "position", "id");

-- AddForeignKey
ALTER TABLE "EagleSmartFolder"
ADD CONSTRAINT "EagleSmartFolder_ownerId_parentId_fkey"
FOREIGN KEY ("ownerId", "parentId")
REFERENCES "EagleSmartFolder"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
