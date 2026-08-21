ALTER TABLE "BotRuntimeConfig"
ADD COLUMN "legacyDispatchEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "legacyExecutionMode" TEXT NOT NULL DEFAULT 'reply';
