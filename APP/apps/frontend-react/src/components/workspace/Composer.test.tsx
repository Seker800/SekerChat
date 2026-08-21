import '@testing-library/jest-dom/vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}));

describe('Composer attachment picker', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses separate media and file inputs on narrow viewports', () => {
    const pickedMedia = new File(['img'], 'image.png', { type: 'image/png' });
    const pickedFile = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const onPickAttachments = vi.fn();

    render(
      <Composer
        channelName="general"
        text=""
        isSending={false}
        isUploading={false}
        replyTarget={null}
        onChange={() => undefined}
        onClearReply={() => undefined}
        onPickAttachments={onPickAttachments}
        onSend={() => undefined}
      />,
    );

    const mediaInput = screen.getByTestId('composer-media-input');
    const fileInput = screen.getByTestId('composer-attachment-input');

    expect(screen.getByTitle('上传图片或视频')).toHaveAttribute('for', 'composer-media-input');
    expect(screen.getByTitle('上传文件')).toHaveAttribute('for', 'composer-file-input');

    fireEvent.change(mediaInput, { target: { files: [pickedMedia] } });
    expect(onPickAttachments).toHaveBeenNthCalledWith(1, [pickedMedia]);

    fireEvent.change(fileInput, { target: { files: [pickedFile] } });
    expect(onPickAttachments).toHaveBeenNthCalledWith(2, [pickedFile]);
  });

  it('keeps text sending available while attachments are uploading', () => {
    const onSend = vi.fn();

    render(
      <Composer
        channelName="general"
        text="hello"
        isSending={false}
        isUploading={true}
        replyTarget={null}
        onChange={() => undefined}
        onClearReply={() => undefined}
        onPickAttachments={() => undefined}
        onSend={onSend}
      />,
    );

    const sendButton = screen.getByRole('button', { name: '发送' });
    expect(sendButton).toBeEnabled();

    fireEvent.click(sendButton);
    expect(onSend).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByTestId('message-composer'), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it('uploads clipboard images when pasting into the composer', () => {
    const onPickAttachments = vi.fn();
    const clipboardImage = new File(['img'], '', { type: 'image/png' });

    render(
      <Composer
        channelName="general"
        text=""
        isSending={false}
        isUploading={false}
        replyTarget={null}
        onChange={() => undefined}
        onClearReply={() => undefined}
        onPickAttachments={onPickAttachments}
        onSend={() => undefined}
      />,
    );

    const composer = screen.getByTestId('message-composer');
    const pasteEvent = createEvent.paste(composer);
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        files: [clipboardImage],
        items: [],
      },
    });

    fireEvent(composer, pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(onPickAttachments).toHaveBeenCalledTimes(1);
    const [[uploadedFiles]] = onPickAttachments.mock.calls as [[File[]]];
    expect(uploadedFiles).toHaveLength(1);
    expect(uploadedFiles[0]?.type).toBe('image/png');
    expect(uploadedFiles[0]?.name).toMatch(/^clipboard-image-\d+\.png$/);
  });

  it('does not intercept plain text paste', () => {
    const onPickAttachments = vi.fn();

    render(
      <Composer
        channelName="general"
        text=""
        isSending={false}
        isUploading={false}
        replyTarget={null}
        onChange={() => undefined}
        onClearReply={() => undefined}
        onPickAttachments={onPickAttachments}
        onSend={() => undefined}
      />,
    );

    const composer = screen.getByTestId('message-composer');
    const pasteEvent = createEvent.paste(composer);
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        files: [],
        items: [
          {
            kind: 'string',
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      },
    });

    fireEvent(composer, pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(onPickAttachments).not.toHaveBeenCalled();
  });

  it('only enables vertical scrolling after the composer reaches its height limit', () => {
    let scrollHeight = 64;
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });

    try {
      const props = {
        channelName: 'general',
        isSending: false,
        isUploading: false,
        replyTarget: null,
        onChange: () => undefined,
        onClearReply: () => undefined,
        onPickAttachments: () => undefined,
        onSend: () => undefined,
      };
      const { rerender } = render(<Composer {...props} text="short" />);
      const composer = screen.getByTestId('message-composer');

      expect(composer).toHaveAttribute('wrap', 'soft');
      expect(composer).toHaveStyle({ height: '64px', overflowY: 'hidden' });

      scrollHeight = 240;
      fireEvent(window, new Event('resize'));

      expect(composer).toHaveStyle({ height: '180px', overflowY: 'auto' });

      scrollHeight = 88;
      rerender(<Composer {...props} text="new text" />);

      expect(composer).toHaveStyle({ height: '88px', overflowY: 'hidden' });
    } finally {
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      } else {
        Reflect.deleteProperty(HTMLTextAreaElement.prototype, 'scrollHeight');
      }
    }
  });
});
