SET lock_timeout = '2s';

ALTER TABLE "EagleImportRunItem"
  ADD COLUMN "terminalProgressAppliedAt" TIMESTAMP(3);
