ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "botConfig" JSONB,
ADD COLUMN IF NOT EXISTS "dndUntil" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "isBot" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "LoginRisk" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFailedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lockoutCount" INTEGER NOT NULL DEFAULT 0,
    "blacklistedAt" TIMESTAMP(3),
    "unblacklistedAt" TIMESTAMP(3),
    "unblacklistedBy" TEXT,
    "unblacklistNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoginRisk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoginRisk_email_idx" ON "LoginRisk"("email");
CREATE INDEX IF NOT EXISTS "LoginRisk_ip_idx" ON "LoginRisk"("ip");
CREATE INDEX IF NOT EXISTS "LoginRisk_blacklistedAt_idx" ON "LoginRisk"("blacklistedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LoginRisk_email_ip_key" ON "LoginRisk"("email", "ip");
