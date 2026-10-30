-- Expand only: legacy tables remain available for rollback and old clients.
CREATE TABLE "SubscriptionPostView" (
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPostView_pkey" PRIMARY KEY ("postId", "userId")
);
CREATE INDEX "SubscriptionPostView_postId_firstViewedAt_userId_idx"
  ON "SubscriptionPostView"("postId", "firstViewedAt", "userId");
ALTER TABLE "SubscriptionPostView" ADD CONSTRAINT "SubscriptionPostView_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "SubscriptionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPostView" ADD CONSTRAINT "SubscriptionPostView_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the earliest available timestamp; unconfirmed recipients are not viewers.
INSERT INTO "SubscriptionPostView" ("postId", "userId", "firstViewedAt")
SELECT "postId", "userId", MIN("openedAt")
FROM (
  SELECT "postId", "userId", "confirmedAt" AS "openedAt"
  FROM "SubscriptionPostRecipient" WHERE "confirmedAt" IS NOT NULL
  UNION ALL
  SELECT "postId", "userId", "readAt" AS "openedAt" FROM "SubscriptionReadState"
) AS legacy
GROUP BY "postId", "userId"
ON CONFLICT ("postId", "userId") DO UPDATE
  SET "firstViewedAt" = LEAST("SubscriptionPostView"."firstViewedAt", EXCLUDED."firstViewedAt");
