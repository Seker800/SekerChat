CREATE TYPE "GroupAiListKind" AS ENUM (
  'FEEDBACK',
  'TASK'
);

CREATE TABLE "GroupAiList" (
  "groupId" TEXT NOT NULL,
  "kind" "GroupAiListKind" NOT NULL,
  "title" TEXT NOT NULL,
  "items" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "lastSourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "updatedByActorType" TEXT NOT NULL,
  "updatedByActorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupAiList_pkey" PRIMARY KEY ("groupId","kind")
);

CREATE INDEX "GroupAiList_kind_updatedAt_idx" ON "GroupAiList"("kind", "updatedAt");

ALTER TABLE "GroupAiList"
ADD CONSTRAINT "GroupAiList_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
