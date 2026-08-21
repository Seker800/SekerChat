UPDATE "SubscriptionPost"
SET "body" = concat_ws(
  E'\n\n',
  NULLIF(btrim("summary"), ''),
  NULLIF(btrim("body"), ''),
  CASE
    WHEN NULLIF(btrim("externalUrl"), '') IS NOT NULL
      THEN '相关链接：' || btrim("externalUrl")
    ELSE NULL
  END
);

DROP INDEX IF EXISTS "SubscriptionPost_type_status_publishedAt_idx";

ALTER TABLE "SubscriptionPost"
  DROP COLUMN "type",
  DROP COLUMN "summary",
  DROP COLUMN "externalUrl";

DROP TYPE "SubscriptionPostType";
