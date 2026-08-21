CREATE TABLE "EagleManualTagGroup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleManualTagGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EagleManualTag"
ADD COLUMN "groupId" TEXT,
ADD COLUMN "isStarred" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "EagleManualTagGroup_ownerId_normalizedName_key"
ON "EagleManualTagGroup"("ownerId", "normalizedName");

CREATE UNIQUE INDEX "EagleManualTagGroup_ownerId_id_key"
ON "EagleManualTagGroup"("ownerId", "id");

CREATE INDEX "EagleManualTagGroup_ownerId_name_idx"
ON "EagleManualTagGroup"("ownerId", "name");

CREATE INDEX "EagleManualTag_ownerId_groupId_name_idx"
ON "EagleManualTag"("ownerId", "groupId", "name");

CREATE INDEX "EagleManualTag_ownerId_isStarred_name_idx"
ON "EagleManualTag"("ownerId", "isStarred", "name");

ALTER TABLE "EagleManualTagGroup"
ADD CONSTRAINT "EagleManualTagGroup_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EagleManualTag"
ADD CONSTRAINT "EagleManualTag_ownerId_groupId_fkey"
FOREIGN KEY ("ownerId", "groupId") REFERENCES "EagleManualTagGroup"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
