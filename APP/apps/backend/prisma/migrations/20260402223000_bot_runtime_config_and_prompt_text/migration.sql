ALTER TABLE "Group"
ADD COLUMN "botPromptText" TEXT;

CREATE TABLE "BotRuntimeConfig" (
  "id" TEXT NOT NULL,
  "openClawBaseUrl" TEXT,
  "openClawApiKey" TEXT,
  "botSlug" TEXT NOT NULL DEFAULT 'openclaw',
  "botEmail" TEXT,
  "defaultPrompt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotRuntimeConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BotRuntimeConfig" (
  "id",
  "openClawBaseUrl",
  "openClawApiKey",
  "botSlug",
  "botEmail",
  "defaultPrompt",
  "updatedAt"
)
VALUES (
  'default',
  NULL,
  NULL,
  'openclaw',
  'openclaw-bot@local.invalid',
  'You are a helpful group assistant.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
