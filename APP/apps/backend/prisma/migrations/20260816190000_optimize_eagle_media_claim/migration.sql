CREATE INDEX CONCURRENTLY "EagleMediaJob_pending_lane_claim_idx"
  ON "EagleMediaJob" ("lane", "availableAt", "createdAt", "assetId", "kind")
  WHERE "status" = 'PENDING';
