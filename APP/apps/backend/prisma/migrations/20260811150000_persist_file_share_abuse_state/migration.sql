CREATE TABLE "FileShareUnlockAttempt" (
    "id" UUID NOT NULL,
    "shareTokenHash" TEXT NOT NULL,
    "clientFingerprint" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lockoutLevel" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileShareUnlockAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileShareClientRisk" (
    "clientFingerprint" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lockoutLevel" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "lastFailedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileShareClientRisk_pkey" PRIMARY KEY ("clientFingerprint")
);

CREATE UNIQUE INDEX "FileShareUnlockAttempt_shareTokenHash_clientFingerprint_key"
ON "FileShareUnlockAttempt"("shareTokenHash", "clientFingerprint");

CREATE INDEX "FileShareUnlockAttempt_updatedAt_idx" ON "FileShareUnlockAttempt"("updatedAt");
CREATE INDEX "FileShareClientRisk_updatedAt_idx" ON "FileShareClientRisk"("updatedAt");
