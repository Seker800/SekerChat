CREATE TABLE "AiAutonomyRuntimeConfig" (
  "id" TEXT NOT NULL,
  "adminGroupId" TEXT,
  "statusStreamEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiAutonomyRuntimeConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiAutonomyRuntimeConfig_adminGroupId_idx" ON "AiAutonomyRuntimeConfig"("adminGroupId");

ALTER TABLE "AiAutonomyRuntimeConfig"
ADD CONSTRAINT "AiAutonomyRuntimeConfig_adminGroupId_fkey"
FOREIGN KEY ("adminGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
