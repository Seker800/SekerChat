import type { Prisma, OutboxEvent } from '@prisma/client';

export const OUTBOX_EVENT_TYPES = {
  artifactUploaded: 'artifact.uploaded.v1',
  groupLifecycleChanged: 'group.lifecycle.changed.v1',
  serverLifecycleRequested: 'server.lifecycle.requested.v1',
  subscriptionChanged: 'subscription.changed.v1',
  userMessageCreated: 'message.user-created.v1',
} as const;

export type ArtifactUploadedPayload = {
  groupId: string;
  actorUserId: string;
  originalName: string;
};

export type EnqueueOutboxEvent = {
  eventType: (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES];
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
};

export type ClaimedOutboxEvent = OutboxEvent;
