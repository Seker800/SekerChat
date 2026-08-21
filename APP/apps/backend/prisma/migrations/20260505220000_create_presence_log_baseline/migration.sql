-- PresenceLog originally entered the Prisma schema without a migration.
-- IF NOT EXISTS keeps this baseline safe for databases where the table was
-- created historically, while allowing the full migration chain to replay.
CREATE TABLE IF NOT EXISTS "PresenceLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "event" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresenceLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PresenceLog_userId_createdAt_idx"
  ON "PresenceLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PresenceLog_createdAt_idx"
  ON "PresenceLog"("createdAt");
CREATE INDEX IF NOT EXISTS "PresenceLog_event_createdAt_idx"
  ON "PresenceLog"("event", "createdAt");
