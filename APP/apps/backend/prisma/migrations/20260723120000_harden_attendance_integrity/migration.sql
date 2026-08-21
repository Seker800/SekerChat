-- Historical presence rows predate the explicit state snapshots. Reconstruct the
-- state that was previously encoded by the online/offline event itself.
UPDATE "PresenceLog"
SET
  "isOnline" = ("event" = 'online'),
  "isDnd" = false
WHERE "event" IN ('online', 'offline');

-- A session without a check-in timestamp has no useful duration semantics.
-- Preserve the row and use its creation timestamp as the safest known start.
UPDATE "CheckInSession"
SET "checkInAt" = "createdAt"
WHERE "checkInAt" IS NULL;

ALTER TABLE "CheckInSession"
ALTER COLUMN "checkInAt" SET NOT NULL;

-- Resolve any duplicates created before the invariant existed. Keep the newest
-- session open and close older duplicates at their own start time so attendance
-- is not inflated by guessed duration.
WITH ranked_open_sessions AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "userId", "workDate"
      ORDER BY "checkInAt" DESC, "createdAt" DESC, "id" DESC
    ) AS open_rank
  FROM "CheckInSession"
  WHERE "checkOutAt" IS NULL
)
UPDATE "CheckInSession" AS session
SET
  "checkOutAt" = session."checkInAt",
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_open_sessions
WHERE session."id" = ranked_open_sessions."id"
  AND ranked_open_sessions.open_rank > 1;

CREATE UNIQUE INDEX "CheckInSession_one_open_per_user_workDate_key"
ON "CheckInSession"("userId", "workDate")
WHERE "checkOutAt" IS NULL;
