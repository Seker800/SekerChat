import { describe, expect, it } from 'vitest';
import {
  classifyMessageListMutation,
  createMessageListSignature,
  modeAfterUserScroll,
  shouldReportLatestVisible,
} from './messageViewportCoordinator';

function makeElement({
  clientHeight = 240,
  scrollHeight = 1000,
  scrollTop,
}: {
  clientHeight?: number;
  scrollHeight?: number;
  scrollTop: number;
}) {
  return {
    clientHeight,
    scrollHeight,
    scrollTop,
  } as HTMLElement;
}

describe('message viewport coordinator', () => {
  it('arms older loading before treating a short top band as the latest edge', () => {
    const element = makeElement({ clientHeight: 200, scrollHeight: 280, scrollTop: 0 });

    expect(modeAfterUserScroll('PinnedToBottom', element, true)).toBe('TopEdgeArmed');
  });

  it('keeps top cooldown until the user leaves the top band', () => {
    expect(modeAfterUserScroll('TopEdgeCooldown', makeElement({ scrollTop: 0 }), true)).toBe('TopEdgeCooldown');
    expect(modeAfterUserScroll('TopEdgeCooldown', makeElement({ scrollTop: 220 }), true)).toBe('BrowsingHistory');
  });

  it('classifies prepends separately from appends and replacements', () => {
    const previous = createMessageListSignature(['message-1', 'message-2']);

    expect(classifyMessageListMutation(previous, createMessageListSignature(['older', 'message-1', 'message-2']))).toMatchObject({
      didAppend: false,
      didPrepend: true,
      didReplaceOnly: false,
    });
    expect(classifyMessageListMutation(previous, createMessageListSignature(['message-1', 'message-2', 'newer']))).toMatchObject({
      didAppend: true,
      didPrepend: false,
      didReplaceOnly: false,
    });
    expect(classifyMessageListMutation(previous, createMessageListSignature(['message-1', 'confirmed']))).toMatchObject({
      didAppend: false,
      didPrepend: false,
      didReplaceOnly: true,
    });
  });

  it('reports latest-message visibility only while pinned to the bottom', () => {
    expect(shouldReportLatestVisible('PinnedToBottom', 'message-2', 'message-1', true)).toBe(true);
    expect(shouldReportLatestVisible('BrowsingHistory', 'message-2', 'message-1', true)).toBe(false);
    expect(shouldReportLatestVisible('PinnedToBottom', 'message-2', 'message-2', true)).toBe(false);
    expect(shouldReportLatestVisible('PinnedToBottom', 'message-2', 'message-1', false)).toBe(false);
  });
});
