CREATE OR REPLACE FUNCTION "syncAlbumTagPhotoCountFromRelation"() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM "AlbumPhoto" WHERE "id" = NEW."photoId" AND "deletedAt" IS NULL) THEN
      UPDATE "AlbumTag" SET "photoCount" = "photoCount" + 1 WHERE "id" = NEW."tagId";
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM "AlbumPhoto" WHERE "id" = OLD."photoId" AND "deletedAt" IS NULL) THEN
    UPDATE "AlbumTag" SET "photoCount" = GREATEST(0, "photoCount" - 1) WHERE "id" = OLD."tagId";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AlbumPhotoTag_photoCount_insert" ON "AlbumPhotoTag";
CREATE TRIGGER "AlbumPhotoTag_photoCount_insert"
AFTER INSERT ON "AlbumPhotoTag"
FOR EACH ROW EXECUTE FUNCTION "syncAlbumTagPhotoCountFromRelation"();

DROP TRIGGER IF EXISTS "AlbumPhotoTag_photoCount_delete" ON "AlbumPhotoTag";
CREATE TRIGGER "AlbumPhotoTag_photoCount_delete"
BEFORE DELETE ON "AlbumPhotoTag"
FOR EACH ROW EXECUTE FUNCTION "syncAlbumTagPhotoCountFromRelation"();

CREATE OR REPLACE FUNCTION "syncAlbumTagPhotoCountFromPhotoState"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL THEN
    UPDATE "AlbumTag" AS tag
    SET "photoCount" = GREATEST(0, tag."photoCount" - 1)
    FROM "AlbumPhotoTag" AS relation
    WHERE relation."photoId" = NEW."id" AND relation."tagId" = tag."id";
  ELSIF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN
    UPDATE "AlbumTag" AS tag
    SET "photoCount" = tag."photoCount" + 1
    FROM "AlbumPhotoTag" AS relation
    WHERE relation."photoId" = NEW."id" AND relation."tagId" = tag."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AlbumPhoto_photoCount_state" ON "AlbumPhoto";
CREATE TRIGGER "AlbumPhoto_photoCount_state"
AFTER UPDATE OF "deletedAt" ON "AlbumPhoto"
FOR EACH ROW EXECUTE FUNCTION "syncAlbumTagPhotoCountFromPhotoState"();
