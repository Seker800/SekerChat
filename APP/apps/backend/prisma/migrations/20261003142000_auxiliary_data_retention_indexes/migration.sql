CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
CREATE INDEX "RefreshToken_revokedAt_idx" ON "RefreshToken"("revokedAt");
CREATE INDEX "OutboxEvent_status_processedAt_idx" ON "OutboxEvent"("status", "processedAt");
CREATE INDEX "OutboxEvent_status_updatedAt_idx" ON "OutboxEvent"("status", "updatedAt");
CREATE INDEX "UploadSession_status_completedAt_idx" ON "UploadSession"("status", "completedAt");
CREATE INDEX "UploadSession_status_abortedAt_idx" ON "UploadSession"("status", "abortedAt");
