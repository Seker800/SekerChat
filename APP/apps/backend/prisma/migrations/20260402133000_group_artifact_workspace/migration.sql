ALTER TABLE "Group"
ADD COLUMN "artifactPath" TEXT;

CREATE INDEX "Group_artifactPath_idx" ON "Group"("artifactPath");

CREATE TABLE "GroupArtifact" (
  "id" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupArtifact_relativePath_key" ON "GroupArtifact"("relativePath");
CREATE INDEX "GroupArtifact_groupId_createdAt_idx" ON "GroupArtifact"("groupId", "createdAt");
CREATE INDEX "GroupArtifact_uploaderId_createdAt_idx" ON "GroupArtifact"("uploaderId", "createdAt");

ALTER TABLE "GroupArtifact"
ADD CONSTRAINT "GroupArtifact_uploaderId_fkey"
FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupArtifact"
ADD CONSTRAINT "GroupArtifact_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
