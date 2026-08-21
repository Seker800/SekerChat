-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");

-- CreateIndex
CREATE INDEX "FileObject_groupId_createdAt_idx" ON "FileObject"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "FileObject_uploaderId_createdAt_idx" ON "FileObject"("uploaderId", "createdAt");

-- Backfill legacy Slice 3 attachment references so the new foreign key can be applied.
INSERT INTO "FileObject" (
    "id",
    "storageKey",
    "originalName",
    "mimeType",
    "size",
    "uploaderId",
    "groupId",
    "createdAt",
    "updatedAt"
)
SELECT
    m."attachmentFileId",
    CONCAT('legacy/', m."attachmentFileId"),
    m."attachmentFileId",
    CASE WHEN m."type" = 'IMAGE' THEN 'image/legacy-placeholder' ELSE 'application/octet-stream' END,
    0,
    m."senderId",
    m."groupId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Message" m
WHERE m."attachmentFileId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "FileObject" f
    WHERE f."id" = m."attachmentFileId"
  );

-- CreateIndex
CREATE INDEX "Message_attachmentFileId_idx" ON "Message"("attachmentFileId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_attachmentFileId_fkey" FOREIGN KEY ("attachmentFileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
