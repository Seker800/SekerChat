CREATE SEQUENCE "Message_eventSequence_seq";

ALTER TABLE "Message"
ADD COLUMN "eventSequence" BIGINT;

ALTER TABLE "Message"
ALTER COLUMN "eventSequence" SET DEFAULT nextval('"Message_eventSequence_seq"');

UPDATE "Message"
SET "eventSequence" = nextval('"Message_eventSequence_seq"')
WHERE "eventSequence" IS NULL;

ALTER TABLE "Message"
ALTER COLUMN "eventSequence" SET NOT NULL;

SELECT setval(
  '"Message_eventSequence_seq"',
  COALESCE((SELECT MAX("eventSequence") FROM "Message"), 1),
  true
);

CREATE UNIQUE INDEX "Message_eventSequence_key" ON "Message"("eventSequence");
CREATE INDEX "Message_groupId_eventSequence_idx" ON "Message"("groupId", "eventSequence");
