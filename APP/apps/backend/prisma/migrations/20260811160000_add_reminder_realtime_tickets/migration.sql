CREATE TABLE "ReminderRealtimeTicket" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminderDeviceTokenId" TEXT NOT NULL,

    CONSTRAINT "ReminderRealtimeTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderRealtimeTicket_tokenHash_key" ON "ReminderRealtimeTicket"("tokenHash");
CREATE INDEX "ReminderRealtimeTicket_expiresAt_consumedAt_idx" ON "ReminderRealtimeTicket"("expiresAt", "consumedAt");
CREATE INDEX "ReminderRealtimeTicket_reminderDeviceTokenId_createdAt_idx" ON "ReminderRealtimeTicket"("reminderDeviceTokenId", "createdAt");

ALTER TABLE "ReminderRealtimeTicket"
ADD CONSTRAINT "ReminderRealtimeTicket_reminderDeviceTokenId_fkey"
FOREIGN KEY ("reminderDeviceTokenId") REFERENCES "ReminderDeviceToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
