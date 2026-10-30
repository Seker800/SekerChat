import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageEditor } from './MessageEditor';

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
const members = [
  { userId: 'u1', displayName: '甲', email: 'a@example.test' },
  { userId: 'u2', displayName: null, email: 'b@example.test' },
];
function setup(initial = '') {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  function Harness() {
    const [text, setText] = useState(initial);
    return (
      <MessageEditor
        text={text}
        members={members}
        onChange={setText}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }
  render(<Harness />);
  return { input: screen.getByRole('textbox'), onSave, onCancel };
}
it('navigates suggestions, inserts the fallback email with the mouse, and restores the caret', () => {
  const { input, onSave } = setup();
  fireEvent.change(input, { target: { value: '@' } });
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  fireEvent.mouseDown(screen.getByRole('button', { name: /b@example.test/ }));
  expect(input).toHaveValue('@b@example.test ');
  expect((input as HTMLTextAreaElement).selectionStart).toBe(16);
  expect(onSave).not.toHaveBeenCalled();
});
it('dismisses suggestions with Escape and cancels the edit on a second Escape', () => {
  const { input, onCancel } = setup();
  fireEvent.change(input, { target: { value: '@' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument();
  expect(input).toHaveValue('@');
  expect(onCancel).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(onCancel).toHaveBeenCalledTimes(1);
});
it('does not submit or select suggestions while an IME composition is active', () => {
  const { input, onSave } = setup();
  fireEvent.change(input, { target: { value: '@' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  expect(input).toHaveValue('@');
  expect(onSave).not.toHaveBeenCalled();
});
it('keeps Shift Enter and empty edits from submitting', () => {
  const { input, onSave } = setup('正文');
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  fireEvent.change(input, { target: { value: ' ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSave).not.toHaveBeenCalled();
});
