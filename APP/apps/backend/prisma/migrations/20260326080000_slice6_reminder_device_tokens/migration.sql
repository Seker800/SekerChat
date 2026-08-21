-- CreateTable
CREATE TABLE "ReminderDeviceToken" (
    "id" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "ReminderDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDeviceToken_tokenHash_key" ON "ReminderDeviceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ReminderDeviceToken_userId_revokedAt_idx" ON "ReminderDeviceToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "ReminderDeviceToken_userId_deviceName_revokedAt_idx" ON "ReminderDeviceToken"("userId", "deviceName", "revokedAt");

-- AddForeignKey
ALTER TABLE "ReminderDeviceToken" ADD CONSTRAINT "ReminderDeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
