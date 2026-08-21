CREATE TYPE "SubscriptionPostType" AS ENUM ('ARTICLE', 'DOWNLOAD', 'NOTICE');
CREATE TYPE "SubscriptionPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');
CREATE TYPE "SubscriptionAttachmentStatus" AS ENUM ('UPLOADING', 'READY');

ALTER TYPE "UploadKind" ADD VALUE 'SUBSCRIPTION_ATTACHMENT';

ALTER TABLE "UploadSession"
  ALTER COLUMN "groupId" DROP NOT NULL,
  ADD COLUMN "subscriptionAttachmentId" TEXT;

CREATE TABLE "SubscriptionPost" (
  "id" TEXT NOT NULL,
  "type" "SubscriptionPostType" NOT NULL,
  "status" "SubscriptionPostStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "externalUrl" TEXT,
  "authorId" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "pinnedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionAttachment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "status" "SubscriptionAttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "sha256" TEXT,
  "downloadCount" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionReadState" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionReadState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionAuditLog" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadSession_subscriptionAttachmentId_key" ON "UploadSession"("subscriptionAttachmentId");
CREATE UNIQUE INDEX "SubscriptionAttachment_storageKey_key" ON "SubscriptionAttachment"("storageKey");
CREATE UNIQUE INDEX "SubscriptionReadState_postId_userId_key" ON "SubscriptionReadState"("postId", "userId");
CREATE INDEX "SubscriptionPost_status_pinnedAt_publishedAt_idx" ON "SubscriptionPost"("status", "pinnedAt", "publishedAt");
CREATE INDEX "SubscriptionPost_authorId_createdAt_idx" ON "SubscriptionPost"("authorId", "createdAt");
CREATE INDEX "SubscriptionPost_type_status_publishedAt_idx" ON "SubscriptionPost"("type", "status", "publishedAt");
CREATE INDEX "SubscriptionAttachment_postId_status_createdAt_idx" ON "SubscriptionAttachment"("postId", "status", "createdAt");
CREATE INDEX "SubscriptionAttachment_uploaderId_createdAt_idx" ON "SubscriptionAttachment"("uploaderId", "createdAt");
CREATE INDEX "SubscriptionReadState_userId_readAt_idx" ON "SubscriptionReadState"("userId", "readAt");
CREATE INDEX "SubscriptionAuditLog_postId_createdAt_idx" ON "SubscriptionAuditLog"("postId", "createdAt");
CREATE INDEX "SubscriptionAuditLog_actorId_createdAt_idx" ON "SubscriptionAuditLog"("actorId", "createdAt");

ALTER TABLE "SubscriptionPost"
  ADD CONSTRAINT "SubscriptionPost_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAttachment"
  ADD CONSTRAINT "SubscriptionAttachment_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "SubscriptionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAttachment"
  ADD CONSTRAINT "SubscriptionAttachment_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionReadState"
  ADD CONSTRAINT "SubscriptionReadState_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "SubscriptionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionReadState"
  ADD CONSTRAINT "SubscriptionReadState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAuditLog"
  ADD CONSTRAINT "SubscriptionAuditLog_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "SubscriptionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAuditLog"
  ADD CONSTRAINT "SubscriptionAuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadSession"
  ADD CONSTRAINT "UploadSession_subscriptionAttachmentId_fkey"
  FOREIGN KEY ("subscriptionAttachmentId") REFERENCES "SubscriptionAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
