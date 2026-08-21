-- Align existing published articles with the rule that authors also confirm reading.
-- This additive backfill leaves every existing recipient and confirmation untouched.
INSERT INTO "SubscriptionPostRecipient" ("postId", "userId", "assignedAt", "confirmedAt")
SELECT post."id", post."authorId", CURRENT_TIMESTAMP, NULL
FROM "SubscriptionPost" AS post
INNER JOIN "User" AS author ON author."id" = post."authorId"
WHERE post."status" = 'PUBLISHED'
  AND author."disabledAt" IS NULL
  AND author."isBot" = FALSE
ON CONFLICT ("postId", "userId") DO NOTHING;
