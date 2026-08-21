CREATE TYPE "GroupWorkStatus" AS ENUM (
  'DISCOVERY',
  'WAITING_OWNER',
  'WAITING_ADMIN',
  'IN_PROGRESS',
  'BLOCKED',
  'PAUSED',
  'DONE',
  'CANCELLED'
);

CREATE TYPE "GroupMemberContextTagType" AS ENUM (
  'OWNER',
  'EXECUTOR',
  'REVIEWER',
  'STAKEHOLDER'
);

CREATE TYPE "OpsRecordType" AS ENUM (
  'REQUIREMENT_DIGEST',
  'CLOSURE_NOTE',
  'ADMIN_ESCALATION_NOTE',
  'DAILY_REPORT'
);

CREATE TYPE "AdminPendingItemType" AS ENUM (
  'ADMIN_DECISION',
  'ADMIN_REPLY_SYNC',
  'OPS_REVIEW'
);

CREATE TYPE "AdminPendingItemPriority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH'
);

CREATE TYPE "AdminPendingItemStatus" AS ENUM (
  'OPEN',
  'DISPATCHED',
  'ANSWERED',
  'CLOSED'
);

CREATE TYPE "ActionProposalStatus" AS ENUM (
  'PROPOSED',
  'CONFIRMED',
  'REJECTED',
  'EXECUTED',
  'EXPIRED'
);

CREATE TABLE "GroupWorkState" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "status" "GroupWorkStatus" NOT NULL,
  "reason" TEXT,
  "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "updatedByActorType" TEXT NOT NULL,
  "updatedByActorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupWorkState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupWorkStateHistory" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "fromStatus" "GroupWorkStatus",
  "toStatus" "GroupWorkStatus" NOT NULL,
  "reason" TEXT,
  "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "actorType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupWorkStateHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupMemberContextTag" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tag" "GroupMemberContextTagType" NOT NULL,
  "reason" TEXT,
  "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdByActorType" TEXT NOT NULL,
  "createdByActorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clearedAt" TIMESTAMP(3),
  CONSTRAINT "GroupMemberContextTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpsRecord" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "type" "OpsRecordType" NOT NULL,
  "title" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdByActorType" TEXT NOT NULL,
  "createdByActorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpsRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPendingItem" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "type" "AdminPendingItemType" NOT NULL,
  "question" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "priority" "AdminPendingItemPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "AdminPendingItemStatus" NOT NULL DEFAULT 'OPEN',
  "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdByActorType" TEXT NOT NULL,
  "createdByActorId" TEXT NOT NULL,
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminPendingItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionProposal" (
  "id" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "status" "ActionProposalStatus" NOT NULL DEFAULT 'PROPOSED',
  "proposedByActorType" TEXT NOT NULL,
  "proposedByActorId" TEXT NOT NULL,
  "confirmedByUserId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupWorkState_groupId_key" ON "GroupWorkState"("groupId");
CREATE INDEX "GroupWorkState_status_updatedAt_idx" ON "GroupWorkState"("status", "updatedAt");
CREATE INDEX "GroupWorkStateHistory_groupId_createdAt_idx" ON "GroupWorkStateHistory"("groupId", "createdAt");
CREATE INDEX "GroupWorkStateHistory_toStatus_createdAt_idx" ON "GroupWorkStateHistory"("toStatus", "createdAt");
CREATE INDEX "GroupMemberContextTag_groupId_userId_clearedAt_idx" ON "GroupMemberContextTag"("groupId", "userId", "clearedAt");
CREATE INDEX "GroupMemberContextTag_groupId_tag_clearedAt_idx" ON "GroupMemberContextTag"("groupId", "tag", "clearedAt");
CREATE INDEX "GroupMemberContextTag_userId_clearedAt_idx" ON "GroupMemberContextTag"("userId", "clearedAt");
CREATE INDEX "OpsRecord_groupId_createdAt_idx" ON "OpsRecord"("groupId", "createdAt");
CREATE INDEX "OpsRecord_type_createdAt_idx" ON "OpsRecord"("type", "createdAt");
CREATE INDEX "AdminPendingItem_groupId_status_updatedAt_idx" ON "AdminPendingItem"("groupId", "status", "updatedAt");
CREATE INDEX "AdminPendingItem_status_priority_createdAt_idx" ON "AdminPendingItem"("status", "priority", "createdAt");
CREATE INDEX "ActionProposal_status_updatedAt_idx" ON "ActionProposal"("status", "updatedAt");
CREATE INDEX "ActionProposal_targetType_targetId_status_idx" ON "ActionProposal"("targetType", "targetId", "status");
CREATE INDEX "ActionProposal_actionType_createdAt_idx" ON "ActionProposal"("actionType", "createdAt");

ALTER TABLE "GroupWorkState"
ADD CONSTRAINT "GroupWorkState_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupWorkStateHistory"
ADD CONSTRAINT "GroupWorkStateHistory_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupMemberContextTag"
ADD CONSTRAINT "GroupMemberContextTag_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupMemberContextTag"
ADD CONSTRAINT "GroupMemberContextTag_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpsRecord"
ADD CONSTRAINT "OpsRecord_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminPendingItem"
ADD CONSTRAINT "AdminPendingItem_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
