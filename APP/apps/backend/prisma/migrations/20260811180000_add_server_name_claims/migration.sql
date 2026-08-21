-- One durable namespace owns both current and historical Server names. This keeps
-- legacy category-only clients mapped to the original stable Server id after rename.
CREATE TYPE "ServerNameKind" AS ENUM ('CANONICAL', 'LEGACY');

CREATE TABLE "ServerNameClaim" (
  "name" TEXT NOT NULL,
  "kind" "ServerNameKind" NOT NULL,
  "serverId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerNameClaim_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "ServerNameClaim_serverId_kind_idx"
ON "ServerNameClaim"("serverId", "kind");

CREATE UNIQUE INDEX "ServerNameClaim_one_canonical_per_server_idx"
ON "ServerNameClaim"("serverId")
WHERE "kind" = 'CANONICAL';

ALTER TABLE "ServerNameClaim"
ADD CONSTRAINT "ServerNameClaim_serverId_fkey"
FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ServerNameClaim" ("name", "kind", "serverId", "createdAt", "updatedAt")
SELECT "name", 'CANONICAL', "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Server";
