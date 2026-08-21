ALTER TABLE "Group"
ADD COLUMN "artifactsConfirmedByUserId" TEXT,
ADD COLUMN "artifactsConfirmedAt" TIMESTAMP(3);

CREATE INDEX "Group_artifactsConfirmedAt_idx" ON "Group"("artifactsConfirmedAt");
