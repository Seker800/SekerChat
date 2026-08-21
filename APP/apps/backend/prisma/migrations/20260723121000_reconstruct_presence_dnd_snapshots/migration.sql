-- The historical online/offline backfill cannot infer DND state from those
-- events alone. Reconstruct every snapshot from the latest explicit DND event
-- for the same user so this also repairs databases that applied the first
-- backfill after DND tracking was already active.
UPDATE "PresenceLog" AS snapshot
SET "isDnd" = CASE
  WHEN snapshot."event" = 'dnd_on' THEN true
  WHEN snapshot."event" = 'dnd_off' THEN false
  ELSE COALESCE(
    (
      SELECT dnd_event."event" = 'dnd_on'
      FROM "PresenceLog" AS dnd_event
      WHERE dnd_event."userId" = snapshot."userId"
        AND dnd_event."event" IN ('dnd_on', 'dnd_off')
        AND dnd_event."createdAt" <= snapshot."createdAt"
      ORDER BY dnd_event."createdAt" DESC, dnd_event."id" DESC
      LIMIT 1
    ),
    false
  )
END;
