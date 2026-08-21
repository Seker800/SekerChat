CREATE TYPE "BotKind" AS ENUM ('STANDARD', 'ORCHESTRATOR');

ALTER TABLE "User"
ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "botSlug" TEXT,
ADD COLUMN "botKind" "BotKind";

ALTER TABLE "Group"
ADD COLUMN "botPromptArtifactId" TEXT;

CREATE UNIQUE INDEX "User_botSlug_key" ON "User"("botSlug");
CREATE INDEX "Group_botPromptArtifactId_idx" ON "Group"("botPromptArtifactId");
