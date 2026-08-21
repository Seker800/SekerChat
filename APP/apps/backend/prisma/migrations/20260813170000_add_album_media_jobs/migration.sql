CREATE TYPE "AlbumMediaJobKind" AS ENUM ('GENERATE_THUMBNAIL', 'PURGE_PHOTO');
CREATE TYPE "AlbumMediaJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "AlbumTag" ADD COLUMN "photoCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "AlbumTag" AS tag
SET "photoCount" = counts.value
FROM (
  SELECT relation."tagId", COUNT(*)::INTEGER AS value
  FROM "AlbumPhotoTag" AS relation
  INNER JOIN "AlbumPhoto" AS photo ON photo.id = relation."photoId"
  WHERE photo."deletedAt" IS NULL
  GROUP BY relation."tagId"
) AS counts
WHERE counts."tagId" = tag.id;

CREATE TABLE "AlbumMediaJob" (
  "id" TEXT NOT NULL,
  "photoId" TEXT NOT NULL,
  "kind" "AlbumMediaJobKind" NOT NULL,
  "status" "AlbumMediaJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlbumMediaJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlbumMediaJob_photoId_kind_key" ON "AlbumMediaJob"("photoId", "kind");
CREATE INDEX "AlbumMediaJob_status_availableAt_idx" ON "AlbumMediaJob"("status", "availableAt");

INSERT INTO "AlbumMediaJob" (
  "id", "photoId", "kind", "status", "availableAt", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::TEXT, photo.id, 'GENERATE_THUMBNAIL', 'PENDING', CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AlbumPhoto" AS photo
WHERE photo."deletedAt" IS NULL AND photo."thumbnailStorageKey" IS NULL
ON CONFLICT ("photoId", "kind") DO NOTHING;

INSERT INTO "AlbumMediaJob" (
  "id", "photoId", "kind", "status", "availableAt", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::TEXT, photo.id, 'PURGE_PHOTO', 'PENDING',
       photo."deletedAt" + INTERVAL '7 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AlbumPhoto" AS photo
WHERE photo."deletedAt" IS NOT NULL
ON CONFLICT ("photoId", "kind") DO NOTHING;
