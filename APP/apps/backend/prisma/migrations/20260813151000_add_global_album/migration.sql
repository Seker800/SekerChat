ALTER TYPE "UploadKind" ADD VALUE 'ALBUM_PHOTO';

CREATE TABLE "AlbumPhoto" (
  "id" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "thumbnailStorageKey" TEXT,
  "thumbnailSize" INTEGER,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlbumPhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlbumTag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlbumTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlbumPhotoTag" (
  "photoId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  CONSTRAINT "AlbumPhotoTag_pkey" PRIMARY KEY ("photoId", "tagId")
);

ALTER TABLE "UploadSession" ADD COLUMN "albumPhotoId" TEXT;
CREATE UNIQUE INDEX "AlbumPhoto_storageKey_key" ON "AlbumPhoto"("storageKey");
CREATE INDEX "AlbumPhoto_deletedAt_createdAt_id_idx" ON "AlbumPhoto"("deletedAt", "createdAt", "id");
CREATE INDEX "AlbumPhoto_uploaderId_createdAt_idx" ON "AlbumPhoto"("uploaderId", "createdAt");
CREATE UNIQUE INDEX "AlbumTag_normalizedName_key" ON "AlbumTag"("normalizedName");
CREATE INDEX "AlbumPhotoTag_tagId_photoId_idx" ON "AlbumPhotoTag"("tagId", "photoId");
CREATE UNIQUE INDEX "UploadSession_albumPhotoId_key" ON "UploadSession"("albumPhotoId");
ALTER TABLE "AlbumPhoto" ADD CONSTRAINT "AlbumPhoto_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumPhoto" ADD CONSTRAINT "AlbumPhoto_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AlbumPhotoTag" ADD CONSTRAINT "AlbumPhotoTag_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "AlbumPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlbumPhotoTag" ADD CONSTRAINT "AlbumPhotoTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "AlbumTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_albumPhotoId_fkey" FOREIGN KEY ("albumPhotoId") REFERENCES "AlbumPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
