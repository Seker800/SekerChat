export const REALTIME_EVENT_VERSION = 1 as const;

export type RealtimeEventType =
  | 'message.created.v1'
  | 'message.updated.v1'
  | 'message.read-cursor.changed.v1'
  | 'group.updated.v1'
  | 'task.created.v1'
  | 'task.updated.v1'
  | 'task.deleted.v1'
  | 'presence.changed.v1'
  | 'subscription.changed.v1';

export type RealtimeJsonObject = Record<string, unknown>;

export interface RealtimeEvent<
  TPayload = RealtimeJsonObject,
  TType extends RealtimeEventType = RealtimeEventType,
> {
  eventVersion: typeof REALTIME_EVENT_VERSION;
  eventId: string;
  type: TType;
  groupId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface RealtimePullResponse<
  TPayload = RealtimeJsonObject,
  TType extends RealtimeEventType = RealtimeEventType,
> {
  events: Array<RealtimeEvent<TPayload, TType>>;
  nextCursor: string;
}

export interface MessageRealtimePayload extends RealtimeJsonObject {
  id: string;
  groupId: string;
  senderId: string;
  type: 'text' | 'image' | 'file' | 'system';
  mentionedUserIds: string[];
}

export interface MessageReadCursorRealtimePayload extends RealtimeJsonObject {
  userId: string;
  lastReadEventSequence: string;
}

export interface GroupUpdatedRealtimePayload extends RealtimeJsonObject {
  groupId: string;
  actorUserId?: string | null;
  reason?: string;
}

export interface TaskRealtimePayload extends RealtimeJsonObject {
  id: string;
}

export interface PresenceRealtimePayload extends RealtimeJsonObject {
  userId: string;
  online: boolean;
  isDnd: boolean;
}

export interface SubscriptionRealtimePayload extends RealtimeJsonObject {
  postId: string;
  reason: 'published' | 'updated' | 'withdrawn' | 'pinned' | 'deleted';
}

export type VersionedRealtimeEvent =
  | RealtimeEvent<MessageRealtimePayload, 'message.created.v1'>
  | RealtimeEvent<MessageRealtimePayload, 'message.updated.v1'>
  | RealtimeEvent<MessageReadCursorRealtimePayload, 'message.read-cursor.changed.v1'>
  | RealtimeEvent<GroupUpdatedRealtimePayload, 'group.updated.v1'>
  | RealtimeEvent<TaskRealtimePayload, 'task.created.v1'>
  | RealtimeEvent<TaskRealtimePayload, 'task.updated.v1'>
  | RealtimeEvent<TaskRealtimePayload, 'task.deleted.v1'>
  | RealtimeEvent<PresenceRealtimePayload, 'presence.changed.v1'>
  | RealtimeEvent<SubscriptionRealtimePayload, 'subscription.changed.v1'>;

export type RealtimeEventParseResult =
  | { success: true; data: VersionedRealtimeEvent }
  | { success: false; kind: 'invalid' | 'unsupported_version'; reason: string };

const EVENT_TYPES = new Set<RealtimeEventType>([
  'message.created.v1',
  'message.updated.v1',
  'message.read-cursor.changed.v1',
  'group.updated.v1',
  'task.created.v1',
  'task.updated.v1',
  'task.deleted.v1',
  'presence.changed.v1',
  'subscription.changed.v1',
]);

export function parseRealtimeEvent(input: unknown): RealtimeEventParseResult {
  if (!isObject(input)) return invalid('event must be an object');
  if (input.eventVersion !== REALTIME_EVENT_VERSION) {
    return {
      success: false,
      kind: 'unsupported_version',
      reason: `unsupported realtime event version: ${String(input.eventVersion)}`,
    };
  }
  if (!isNonEmptyString(input.eventId)) return invalid('eventId must be a non-empty string');
  if (!isNonEmptyString(input.type) || !EVENT_TYPES.has(input.type as RealtimeEventType)) {
    return invalid('type is not a supported realtime event');
  }
  if (typeof input.groupId !== 'string') return invalid('groupId must be a string');
  if (!isIsoDate(input.occurredAt)) return invalid('occurredAt must be an ISO timestamp');
  if (!isObject(input.payload)) return invalid('payload must be an object');
  if (!isPayloadValid(input.type as RealtimeEventType, input.payload)) {
    return invalid(`payload is invalid for ${input.type}`);
  }

  return { success: true, data: input as unknown as VersionedRealtimeEvent };
}

export function assertRealtimeEvent(input: unknown): asserts input is VersionedRealtimeEvent {
  const result = parseRealtimeEvent(input);
  if (!result.success) throw new TypeError(result.reason);
}

export function serializeRealtimeEvent(input: unknown): string {
  assertRealtimeEvent(input);
  return JSON.stringify(input);
}

function isPayloadValid(type: RealtimeEventType, payload: RealtimeJsonObject): boolean {
  switch (type) {
    case 'message.created.v1':
    case 'message.updated.v1':
      return isMessagePayload(payload);
    case 'message.read-cursor.changed.v1':
      return (
        isNonEmptyString(payload.userId) &&
        isPositiveIntegerString(payload.lastReadEventSequence)
      );
    case 'group.updated.v1':
      return (
        isNonEmptyString(payload.groupId) &&
        isOptionalString(payload.reason) &&
        (payload.actorUserId === null || isOptionalString(payload.actorUserId))
      );
    case 'task.created.v1':
    case 'task.updated.v1':
    case 'task.deleted.v1':
      return isNonEmptyString(payload.id);
    case 'presence.changed.v1':
      return (
        isNonEmptyString(payload.userId) &&
        typeof payload.online === 'boolean' &&
        typeof payload.isDnd === 'boolean'
      );
    case 'subscription.changed.v1':
      return (
        isNonEmptyString(payload.postId) &&
        ['published', 'updated', 'withdrawn', 'pinned', 'deleted'].includes(String(payload.reason))
      );
  }
}

function isMessagePayload(payload: RealtimeJsonObject): boolean {
  return (
    isNonEmptyString(payload.id) &&
    isNonEmptyString(payload.groupId) &&
    isNonEmptyString(payload.senderId) &&
    ['text', 'image', 'file', 'system'].includes(String(payload.type)) &&
    Array.isArray(payload.mentionedUserIds) &&
    payload.mentionedUserIds.every(isNonEmptyString)
  );
}

function isObject(value: unknown): value is RealtimeJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isPositiveIntegerString(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function invalid(reason: string): RealtimeEventParseResult {
  return { success: false, kind: 'invalid', reason };
}
