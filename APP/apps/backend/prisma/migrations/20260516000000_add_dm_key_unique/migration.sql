-- Add nullable dmKey column.
-- UNIQUE on a nullable column allows multiple NULLs; this is intentional —
-- historical duplicate DMs (same user pair, multiple groups) will keep
-- dmKey = NULL until resolved by an operator.
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "dmKey" TEXT;

-- Backfill dmKey ONLY for DM groups whose user pair appears exactly once.
-- Duplicate pairs remain dmKey = NULL so they don't violate the unique index,
-- and the application falls back to member-based lookup for them.
WITH dm_pairs AS (
  SELECT
    g.id AS group_id,
    string_agg(m."userId", ':' ORDER BY m."userId") AS computed_key
  FROM "Group" g
  JOIN "GroupMember" m ON m."groupId" = g.id
  WHERE g."isDM" = true AND g."dmKey" IS NULL
  GROUP BY g.id
  HAVING count(m."userId") = 2
),
unique_pairs AS (
  SELECT computed_key
  FROM dm_pairs
  GROUP BY computed_key
  HAVING count(*) = 1
)
UPDATE "Group" g
SET "dmKey" = dp.computed_key
FROM dm_pairs dp
WHERE g.id = dp.group_id
  AND dp.computed_key IN (SELECT computed_key FROM unique_pairs);

-- Report any historical duplicates that were left with NULL dmKey.
-- These need manual operator review to decide merge/archive strategy.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT string_agg(m."userId", ':' ORDER BY m."userId") AS k
    FROM "Group" g
    JOIN "GroupMember" m ON m."groupId" = g.id
    WHERE g."isDM" = true AND g."dmKey" IS NULL
    GROUP BY g.id
    HAVING count(m."userId") = 2
  ) pairs
  GROUP BY k
  HAVING count(*) > 1
  LIMIT 1;

  IF dup_count > 0 THEN
    RAISE WARNING 'Historical duplicate DMs detected: some user pairs have multiple DM groups with dmKey=NULL. These groups are left unchanged — resolve them manually before a future migration can enforce NOT NULL on dmKey.';
  END IF;
END $$;

-- Unique index: prevents future duplicates. Existing NULL dmKey rows coexist.
CREATE UNIQUE INDEX IF NOT EXISTS "Group_dmKey_key" ON "Group"("dmKey");
