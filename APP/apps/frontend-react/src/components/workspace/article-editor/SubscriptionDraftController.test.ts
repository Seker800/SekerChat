import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionPost, SubscriptionPostInput } from '../../../lib/subscriptions-api';
import { SubscriptionDraftController } from './SubscriptionDraftController';

const emptyInput: SubscriptionPostInput = { title: '', body: '', tags: [] };

function post(input: SubscriptionPostInput, id = 'draft-1'): SubscriptionPost {
  return {
    id,
    status: 'DRAFT',
    ...input,
    isPinned: false,
    publishedAt: null,
    updatedAt: '2026-08-11T00:00:00.000Z',
    author: { id: 'manager-1', displayName: 'Manager', email: 'manager@example.com' },
    attachments: [],
    isRecipient: false,
    isConfirmed: false,
    confirmedAt: null,
    confirmationProgress: null,
  };
}

describe('SubscriptionDraftController', () => {
  it('creates an untitled draft before an image upload needs a target', async () => {
    const create = vi.fn(async (input: SubscriptionPostInput) => post(input));
    const controller = new SubscriptionDraftController({ create, update: vi.fn() });

    await expect(controller.ensureDraft(emptyInput)).resolves.toBe('draft-1');
    expect(create).toHaveBeenCalledWith(emptyInput);
  });

  it('serializes saves and collapses intermediate snapshots to the latest value', async () => {
    let releaseFirstSave!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const update = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstSave;
        return post(emptyInput);
      })
      .mockImplementation(async (_id: string, input: SubscriptionPostInput) => post(input));
    const controller = new SubscriptionDraftController({
      draftId: 'draft-1',
      create: vi.fn(),
      update,
    });

    const first = controller.save({ ...emptyInput, body: 'first' });
    const second = controller.save({ ...emptyInput, body: 'second' });
    const third = controller.save({ ...emptyInput, body: 'latest' });
    releaseFirstSave();
    await Promise.all([first, second, third]);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.[1]).toMatchObject({ body: 'latest' });
  });
});
