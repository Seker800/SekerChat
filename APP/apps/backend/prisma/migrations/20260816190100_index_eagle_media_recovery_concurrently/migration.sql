CREATE INDEX CONCURRENTLY "EagleMediaJob_processing_lane_recovery_idx"
  ON "EagleMediaJob" ("lane", "lockedAt", "createdAt", "assetId", "kind")
  WHERE "status" = 'PROCESSING';
