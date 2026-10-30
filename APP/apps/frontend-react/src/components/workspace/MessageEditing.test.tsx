import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessagePane } from './MessagePane';
import type { MessageResponse } from '../../lib/messages-files-api';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('selects a mention while editing without saving until the next Enter', () => {
  const onEdit = vi.fn();
  const message = {
    id: 'm1',
    groupId: 'g1',
    senderId: 'u1',
    type: 'text',
    text: '原文',
    mentionedUserIds: [],
    createdAt: '2026-10-30T00:00:00Z',
    sender: { id: 'u1', displayName: '作者', email: 'author@example.test', avatarUrl: null },
    attachment: null,
    replyTo: null,
    editedAt: null,
    revokedAt: null,
    readReceipt: { totalRecipients: 0, readCount: 0, unreadCount: 0, readBy: [], unreadBy: [] },
  } as MessageResponse;
  render(
    <MessagePane
      activeGroupId="g1"
      messages={[message]}
      currentUserId="u1"
      groupMembers={[{ userId: 'u2', displayName: '同事', email: 'colleague@example.test' }]}
      onReply={() => undefined}
      onEditMessage={onEdit}
    />,
  );
  fireEvent.contextMenu(screen.getByTestId('message-card'));
  fireEvent.click(screen.getByText('编辑'));
  const input = screen.getByRole('textbox');
  fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
  expect(screen.getByRole('textbox')).toBe(input);
  fireEvent.change(input, { target: { value: '请 @同事' } });
  expect(screen.getByTestId('mention-dropdown')).toHaveTextContent('同事');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue('请 @同事 ');
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onEdit).toHaveBeenCalledWith('m1', '请 @同事');
});
