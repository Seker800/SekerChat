ALTER TABLE "FileObject" ADD COLUMN "attachedAt" TIMESTAMP(3);

UPDATE "FileObject" f
SET "attachedAt" = attached.min_created_at
FROM (
  SELECT "attachmentFileId" AS file_id, MIN("createdAt") AS min_created_at
  FROM "Message"
  WHERE "attachmentFileId" IS NOT NULL
  GROUP BY "attachmentFileId"
) attached
WHERE f.id = attached.file_id;
