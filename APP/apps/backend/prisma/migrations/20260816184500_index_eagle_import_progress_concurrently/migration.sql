CREATE INDEX CONCURRENTLY "EagleImportRunItem_unprojected_terminal_idx"
  ON "EagleImportRunItem" ("runId", "updatedAt", "id")
  WHERE "terminalProgressAppliedAt" IS NULL
    AND "status" IN ('IMPORTED', 'SKIPPED', 'FAILED');
