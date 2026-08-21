-- Expand only: the legacy Category table and Group.category column stay in place
-- until every deployed consumer has moved to stable Server ids.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT COALESCE(NULLIF(BTRIM("name"), ''), '未分类') AS normalized_name
      FROM "Category"
      GROUP BY COALESCE(NULLIF(BTRIM("name"), ''), '未分类')
      HAVING COUNT(*) > 1
    ) ambiguous_categories
  ) THEN
    RAISE EXCEPTION 'Cannot backfill Server: multiple Category rows normalize to the same name.';
  END IF;
END $$;

CREATE TABLE "Server" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatarStorageKey" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Server_name_key" ON "Server"("name");
CREATE INDEX "Server_archivedAt_updatedAt_idx" ON "Server"("archivedAt", "updatedAt");

ALTER TABLE "Group" ADD COLUMN "serverId" TEXT;
CREATE INDEX "Group_serverId_idx" ON "Group"("serverId");

WITH server_names AS (
  SELECT COALESCE(NULLIF(BTRIM("name"), ''), '未分类') AS "name"
  FROM "Category"

  UNION

  SELECT COALESCE(NULLIF(BTRIM("category"), ''), '未分类') AS "name"
  FROM "Group"
  WHERE "isDM" = false
), normalized_servers AS (
  SELECT
    names."name",
    category."avatarStorageKey",
    category."archivedAt",
    COALESCE(category."createdAt", CURRENT_TIMESTAMP) AS "createdAt",
    COALESCE(category."updatedAt", CURRENT_TIMESTAMP) AS "updatedAt"
  FROM server_names names
  LEFT JOIN "Category" category
    ON COALESCE(NULLIF(BTRIM(category."name"), ''), '未分类') = names."name"
)
INSERT INTO "Server" (
  "id",
  "name",
  "avatarStorageKey",
  "archivedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  (
    SUBSTRING(MD5('sekerchat-server:' || "name") FROM 1 FOR 8) || '-' ||
    SUBSTRING(MD5('sekerchat-server:' || "name") FROM 9 FOR 4) || '-' ||
    SUBSTRING(MD5('sekerchat-server:' || "name") FROM 13 FOR 4) || '-' ||
    SUBSTRING(MD5('sekerchat-server:' || "name") FROM 17 FOR 4) || '-' ||
    SUBSTRING(MD5('sekerchat-server:' || "name") FROM 21 FOR 12)
  ),
  "name",
  "avatarStorageKey",
  "archivedAt",
  "createdAt",
  "updatedAt"
FROM normalized_servers;

UPDATE "Group" channel
SET "serverId" = server."id"
FROM "Server" server
WHERE
  channel."isDM" = false
  AND server."name" = COALESCE(NULLIF(BTRIM(channel."category"), ''), '未分类');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Group" WHERE "isDM" = false AND "serverId" IS NULL) THEN
    RAISE EXCEPTION 'Server backfill incomplete: a non-DM Group has no Server.';
  END IF;

  IF EXISTS (SELECT 1 FROM "Group" WHERE "isDM" = true AND "serverId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Server backfill invalid: a DM Group references a Server.';
  END IF;
END $$;

ALTER TABLE "Group"
ADD CONSTRAINT "Group_serverId_fkey"
FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
