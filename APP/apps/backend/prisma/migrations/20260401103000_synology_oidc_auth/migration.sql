ALTER TABLE "User"
ADD COLUMN "oidcProvider" TEXT,
ADD COLUMN "oidcSubject" TEXT,
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_oidcProvider_oidcSubject_key" ON "User"("oidcProvider", "oidcSubject");
