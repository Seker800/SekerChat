ALTER TABLE "AlbumPhoto" ADD COLUMN "revision" BIGINT;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id")::BIGINT AS revision
  FROM "AlbumPhoto"
)
UPDATE "AlbumPhoto" AS photo
SET "revision" = ranked.revision
FROM ranked
WHERE photo."id" = ranked."id";

ALTER TABLE "AlbumPhoto" ALTER COLUMN "revision" SET NOT NULL;
CREATE UNIQUE INDEX "AlbumPhoto_revision_key" ON "AlbumPhoto"("revision");

CREATE TABLE "AlbumState" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "revision" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlbumState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AlbumState_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "AlbumState" ("id", "revision", "updatedAt")
SELECT 1, COALESCE(MAX("revision"), 0), CURRENT_TIMESTAMP FROM "AlbumPhoto";

CREATE TABLE "AlbumReadState" (
  "userId" TEXT NOT NULL,
  "seenRevision" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlbumReadState_pkey" PRIMARY KEY ("userId")
);

INSERT INTO "AlbumReadState" ("userId", "seenRevision", "updatedAt")
SELECT "id", (SELECT "revision" FROM "AlbumState" WHERE "id" = 1), CURRENT_TIMESTAMP
FROM "User";

ALTER TABLE "AlbumReadState"
ADD CONSTRAINT "AlbumReadState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
