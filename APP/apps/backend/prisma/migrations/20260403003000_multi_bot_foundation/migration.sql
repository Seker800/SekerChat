CREATE TABLE "BotAgent" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "kind" "BotKind" NOT NULL DEFAULT 'STANDARD',
  "openClawBaseUrl" TEXT,
  "openClawApiKey" TEXT,
  "defaultPrompt" TEXT,
  "botUserId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupBotBinding" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "botAgentId" TEXT NOT NULL,
  "promptText" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupBotBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotAgent_slug_key" ON "BotAgent"("slug");
CREATE UNIQUE INDEX "BotAgent_botUserId_key" ON "BotAgent"("botUserId");
CREATE INDEX "BotAgent_isEnabled_updatedAt_idx" ON "BotAgent"("isEnabled", "updatedAt");

CREATE UNIQUE INDEX "GroupBotBinding_groupId_key" ON "GroupBotBinding"("groupId");
CREATE INDEX "GroupBotBinding_botAgentId_isEnabled_idx" ON "GroupBotBinding"("botAgentId", "isEnabled");
CREATE INDEX "GroupBotBinding_groupId_isEnabled_idx" ON "GroupBotBinding"("groupId", "isEnabled");

ALTER TABLE "BotAgent"
ADD CONSTRAINT "BotAgent_botUserId_fkey"
FOREIGN KEY ("botUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GroupBotBinding"
ADD CONSTRAINT "GroupBotBinding_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupBotBinding"
ADD CONSTRAINT "GroupBotBinding_botAgentId_fkey"
FOREIGN KEY ("botAgentId") REFERENCES "BotAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH runtime_config AS (
  SELECT
    COALESCE("botSlug", 'openclaw') AS "botSlug",
    COALESCE("botEmail", CONCAT(COALESCE("botSlug", 'openclaw'), '-bot@local.invalid')) AS "botEmail",
    "openClawBaseUrl",
    "openClawApiKey",
    "defaultPrompt"
  FROM "BotRuntimeConfig"
  WHERE "id" = 'default'
),
bot_user AS (
  SELECT u."id"
  FROM "User" u
  JOIN runtime_config rc
    ON u."isBot" = true
   AND (u."botSlug" = rc."botSlug" OR u."email" = rc."botEmail")
  LIMIT 1
)
INSERT INTO "BotAgent" (
  "id",
  "slug",
  "displayName",
  "kind",
  "openClawBaseUrl",
  "openClawApiKey",
  "defaultPrompt",
  "botUserId",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  'default-openclaw-agent',
  rc."botSlug",
  'OpenClaw',
  'STANDARD'::"BotKind",
  rc."openClawBaseUrl",
  rc."openClawApiKey",
  rc."defaultPrompt",
  bu."id",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM runtime_config rc
JOIN bot_user bu ON true
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "GroupBotBinding" (
  "id",
  "groupId",
  "botAgentId",
  "promptText",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('binding-', g."id"),
  g."id",
  'default-openclaw-agent',
  g."botPromptText",
  EXISTS (
    SELECT 1
    FROM "GroupMember" gm
    JOIN "BotAgent" ba ON ba."id" = 'default-openclaw-agent'
    WHERE gm."groupId" = g."id"
      AND gm."userId" = ba."botUserId"
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Group" g
WHERE EXISTS (SELECT 1 FROM "BotAgent" WHERE "id" = 'default-openclaw-agent')
  AND (
    g."botPromptText" IS NOT NULL
    OR g."botPromptArtifactId" IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM "GroupMember" gm
      JOIN "BotAgent" ba ON ba."id" = 'default-openclaw-agent'
      WHERE gm."groupId" = g."id"
        AND gm."userId" = ba."botUserId"
    )
  )
ON CONFLICT ("groupId") DO NOTHING;
