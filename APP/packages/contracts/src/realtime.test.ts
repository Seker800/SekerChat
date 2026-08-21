import { describe, expect, it } from 'vitest';
import { parseRealtimeEvent } from './index';

describe('parseRealtimeEvent', () => {
  it('accepts a versioned message event', () => {
    const result = parseRealtimeEvent({
      eventVersion: 1,
      eventId: '42',
      type: 'message.created.v1',
      groupId: 'group-1',
      occurredAt: '2026-08-11T08:00:00.000Z',
      payload: {
        id: 'message-1',
        groupId: 'group-1',
        senderId: 'user-1',
        type: 'text',
        mentionedUserIds: [],
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a monotonic read cursor event and rejects unsafe cursor values', () => {
    const baseEvent = {
      eventVersion: 1,
      eventId: 'read-cursor:group-1:user-2:42',
      type: 'message.read-cursor.changed.v1',
      groupId: 'group-1',
      occurredAt: '2026-08-12T10:00:00.000Z',
      payload: { userId: 'user-2', lastReadEventSequence: '42' },
    };

    expect(parseRealtimeEvent(baseEvent).success).toBe(true);
    expect(
      parseRealtimeEvent({
        ...baseEvent,
        payload: { ...baseEvent.payload, lastReadEventSequence: '-1' },
      }),
    ).toMatchObject({ success: false, kind: 'invalid' });
  });

  it('rejects malformed payloads without returning partially trusted data', () => {
    const result = parseRealtimeEvent({
      eventVersion: 1,
      eventId: '42',
      type: 'message.created.v1',
      groupId: 'group-1',
      occurredAt: 'not-a-date',
      payload: { id: 123 },
    });

    expect(result).toMatchObject({ success: false, kind: 'invalid' });
  });

  it('classifies future versions separately so consumers can recover safely', () => {
    const result = parseRealtimeEvent({
      eventVersion: 2,
      eventId: 'future-1',
      type: 'message.created.v2',
      groupId: 'group-1',
      occurredAt: '2026-08-11T08:00:00.000Z',
      payload: {},
    });

    expect(result).toMatchObject({ success: false, kind: 'unsupported_version' });
  });
});
