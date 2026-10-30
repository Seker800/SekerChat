import { describe, expect, it } from 'vitest';
import {
  mergeLatestMessagePage,
  mergeOlderMessagePage,
  receiveCreatedMessage,
  patchTimelineMessage,
  confirmTimelineMessage,
  refreshMessageTimeline,
} from './message-timeline';
import type { MessageResponse } from './messages-files-api';
const msg = (id: string, sequence: string): MessageResponse =>
  ({
    id,
    groupId: 'a',
    eventSequence: sequence,
    type: 'text',
    text: id,
    createdAt: '2026-10-30T00:00:00Z',
  }) as MessageResponse;

describe('message timeline', () => {
  it('does not create a partial page from an isolated event', () => {
    expect(receiveCreatedMessage(undefined, 'a', msg('1', '1'))).toBeUndefined();
  });
  it('inserts out-of-order delivery by the exact event sequence', () => {
    const current = {
      groupId: 'a',
      items: [msg('1', '9007199254740993'), msg('3', '9007199254740995')],
      nextCursor: 'old',
    };
    expect(
      receiveCreatedMessage(current, 'a', msg('2', '9007199254740994'))?.items.map((x) => x.id),
    ).toEqual(['1', '2', '3']);
  });
  it('patches loaded messages without inserting unknown edits or losing render keys', () => {
    const current = {
      groupId: 'a',
      items: [{ ...msg('1', '1'), clientKey: 'local' }],
      nextCursor: 'old',
    };
    expect(patchTimelineMessage(current, 'a', msg('unknown', '0'))).toBe(current);
    expect(
      patchTimelineMessage(current, 'a', { ...msg('1', '1'), text: 'edited' })?.items[0],
    ).toMatchObject({ text: 'edited', clientKey: 'local' });
  });
  it('deduplicates overlapping pages and retains the oldest cursor', () => {
    const current = { groupId: 'a', items: [msg('2', '2'), msg('3', '3')], nextCursor: 'cursor' };
    const next = mergeOlderMessagePage(current, {
      groupId: 'a',
      items: [msg('1', '1'), msg('2', '2')],
      nextCursor: null,
    });
    expect(next.items.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(next.nextCursor).toBeNull();
  });
  it('preserves history and failed optimistic messages on refresh', () => {
    const failed = { ...msg('local', '9'), eventSequence: undefined, sendError: 'offline' };
    const next = mergeLatestMessagePage(
      { groupId: 'a', items: [msg('1', '1'), failed], nextCursor: 'old' },
      { groupId: 'a', items: [msg('2', '2')], nextCursor: 'recent' },
    );
    expect(next.items.map((x) => x.id)).toEqual(['1', '2', 'local']);
    expect(next.nextCursor).toBe('old');
  });
  it('uses the authoritative cursor when filling an optimistic-only partial cache', () => {
    const next = mergeLatestMessagePage(
      { groupId: 'a', items: [{ ...msg('local', '9'), isSending: true }], isPartial: true },
      { groupId: 'a', items: [msg('1', '1')], nextCursor: 'old' },
    );
    expect(next.nextCursor).toBe('old');
    expect(next.isPartial).toBeUndefined();
  });
  it('does not regress a newer edit with a delayed HTTP response', () => {
    const next = mergeLatestMessagePage(
      {
        groupId: 'a',
        items: [{ ...msg('1', '1'), text: 'new', editedAt: '2026-10-30T02:00:00Z' }],
      },
      { groupId: 'a', items: [msg('1', '1')] },
    );
    expect(next.items[0]?.text).toBe('new');
  });
  it('replaces an optimistic send once when realtime won the race', () => {
    const current = {
      groupId: 'a',
      items: [
        { ...msg('local', '1'), isSending: true },
        msg('server', '1'),
        { ...msg('next', '2'), isSending: true },
      ],
    };
    const next = confirmTimelineMessage(current, 'a', 'local', msg('server', '1'));
    expect(next.items.map((x) => x.id)).toEqual(['server', 'next']);
    expect(next.items[0]?.clientKey).toBe('local');
  });
  it('bridges reconnect gaps until a fetched page overlaps loaded history', async () => {
    const current = { groupId: 'a', items: [msg('1', '1')], nextCursor: 'old' };
    const calls: Array<string | undefined> = [];
    const next = await refreshMessageTimeline(
      async (cursor) => {
        calls.push(cursor);
        return cursor
          ? { groupId: 'a', items: [msg('1', '1'), msg('2', '2')], nextCursor: 'old' }
          : { groupId: 'a', items: [msg('3', '3')], nextCursor: 'bridge' };
      },
      () => current,
    );
    expect(calls).toEqual([undefined, 'bridge']);
    expect(next.items.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(next.nextCursor).toBe('old');
  });
  it('includes events and local sends that arrive while HTTP is in flight', async () => {
    let current = { groupId: 'a', items: [msg('1', '1')] };
    const next = await refreshMessageTimeline(
      async () => {
        current = { ...current, items: [...current.items, msg('3', '3')] };
        return { groupId: 'a', items: [msg('1', '1'), msg('2', '2')] };
      },
      () => current,
    );
    expect(next.items.map((x) => x.id)).toEqual(['1', '2', '3']);
  });
  it('rejects broken cursor loops instead of issuing unlimited requests', async () => {
    await expect(
      refreshMessageTimeline(
        async () => ({ groupId: 'a', items: [msg('3', '3')], nextCursor: 'same' }),
        () => ({ groupId: 'a', items: [msg('1', '1')] }),
      ),
    ).rejects.toThrow('游标');
  });
});

it('bridges from the last HTTP boundary even if a newer live event is already cached', async () => {
  const current = {
    groupId: 'a',
    items: [msg('1', '1'), msg('10', '10')],
    latestReadMessageId: '1',
    nextCursor: 'old',
  };
  const calls: Array<string | undefined> = [];
  const next = await refreshMessageTimeline(
    async (cursor) => {
      calls.push(cursor);
      return cursor
        ? { groupId: 'a', items: [msg('1', '1'), msg('5', '5')], nextCursor: 'old' }
        : { groupId: 'a', items: [msg('10', '10')], nextCursor: 'gap' };
    },
    () => current,
  );
  expect(calls).toEqual([undefined, 'gap']);
  expect(next.items.map((item) => item.id)).toEqual(['1', '5', '10']);
});
