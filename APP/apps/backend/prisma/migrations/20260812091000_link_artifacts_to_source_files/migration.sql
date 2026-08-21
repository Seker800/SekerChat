ALTER TABLE "GroupArtifact"
ADD COLUMN "sourceFileId" TEXT;

CREATE UNIQUE INDEX "GroupArtifact_sourceFileId_key"
ON "GroupArtifact"("sourceFileId");

ALTER TABLE "GroupArtifact"
ADD CONSTRAINT "GroupArtifact_sourceFileId_fkey"
FOREIGN KEY ("sourceFileId") REFERENCES "FileObject"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
