-- Expand: persist the publication-time recipient snapshot independently of legacy read state.
CREATE TABLE "SubscriptionPostRecipient" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionPostRecipient_pkey" PRIMARY KEY ("postId", "userId")
);

CREATE INDEX "SubscriptionPostRecipient_userId_confirmedAt_idx"
ON "SubscriptionPostRecipient"("userId", "confirmedAt");

CREATE INDEX "SubscriptionPostRecipient_postId_confirmedAt_idx"
ON "SubscriptionPostRecipient"("postId", "confirmedAt");

ALTER TABLE "SubscriptionPostRecipient"
ADD CONSTRAINT "SubscriptionPostRecipient_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "SubscriptionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionPostRecipient"
ADD CONSTRAINT "SubscriptionPostRecipient_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cutover: existing published articles start fresh for every currently active human recipient.
-- No legacy readAt value is copied into confirmedAt.
INSERT INTO "SubscriptionPostRecipient" ("postId", "userId", "assignedAt", "confirmedAt")
SELECT post."id", recipient."id", CURRENT_TIMESTAMP, NULL
FROM "SubscriptionPost" AS post
CROSS JOIN "User" AS recipient
WHERE post."status" = 'PUBLISHED'
  AND recipient."disabledAt" IS NULL
  AND recipient."isBot" = FALSE
  AND recipient."id" <> post."authorId"
ON CONFLICT ("postId", "userId") DO NOTHING;

-- This is the only intentionally destructive data operation in this migration.
DELETE FROM "SubscriptionReadState";
