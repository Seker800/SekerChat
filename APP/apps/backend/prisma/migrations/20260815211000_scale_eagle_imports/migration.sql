CREATE INDEX "EagleImportRun_externalLibraryId_createdAt_idx"
ON "EagleImportRun"("externalLibraryId", "createdAt");

CREATE INDEX "EagleImportRun_status_completedAt_idx"
ON "EagleImportRun"("status", "completedAt");

WITH counters AS (
  SELECT
    run."id",
    COUNT(item."id") FILTER (WHERE item."status" = 'STAGED')::integer AS "stagedItemCount",
    COUNT(item."id") FILTER (WHERE item."status" = 'IMPORTED')::integer AS "importedItemCount",
    COUNT(item."id") FILTER (WHERE item."status" = 'SKIPPED')::integer AS "skippedItemCount",
    COUNT(item."id") FILTER (WHERE item."status" = 'FAILED')::integer AS "failedItemCount"
  FROM "EagleImportRun" run
  LEFT JOIN "EagleImportRunItem" item ON item."runId" = run."id"
  GROUP BY run."id"
)
UPDATE "EagleImportRun" run
SET
  "stagedItemCount" = counters."stagedItemCount",
  "importedItemCount" = counters."importedItemCount",
  "skippedItemCount" = counters."skippedItemCount",
  "failedItemCount" = counters."failedItemCount"
FROM counters
WHERE run."id" = counters."id";
