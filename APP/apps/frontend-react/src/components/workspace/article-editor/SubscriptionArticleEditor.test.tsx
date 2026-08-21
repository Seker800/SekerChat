import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionArticleEditor } from './SubscriptionArticleEditor';

describe('SubscriptionArticleEditor', () => {
  it('keeps a single editor instance when React replays effects in development', async () => {
    const onMarkdownChange = vi.fn();
    const uploadImage = vi.fn(async () => 'attachment://strict-image');
    render(
      <StrictMode>
        <SubscriptionArticleEditor
          documentKey="strict-mode"
          initialMarkdown=""
          onMarkdownChange={onMarkdownChange}
          uploadImage={uploadImage}
          resolveImageUrl={vi.fn()}
        />
      </StrictMode>,
    );

    const editorRoot = screen.getByTestId('subscription-article-editor');
    await waitFor(() => {
      expect(editorRoot.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
    });
    const textbox = editorRoot.querySelector<HTMLElement>('[contenteditable="true"]')!;
    const image = new File(['png'], 'strict.png', { type: 'image/png' });
    const clipboardFiles = {
      0: image,
      length: 1,
      item: (index: number) => (index === 0 ? image : null),
    };
    class TestClipboardEvent extends Event {}
    class TestDragEvent extends Event {}
    vi.stubGlobal('ClipboardEvent', TestClipboardEvent);
    vi.stubGlobal('DragEvent', TestDragEvent);
    const event = new TestClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: clipboardFiles, getData: () => '' },
    });
    fireEvent(textbox, event);

    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled());
  });

  it('opens existing GFM tables without flattening them to plain paragraphs', async () => {
    render(
      <SubscriptionArticleEditor
        documentKey="existing-table"
        initialMarkdown={'| 功能 | 状态 |\n| --- | --- |\n| 图片粘贴 | 完成 |'}
        onMarkdownChange={vi.fn()}
        uploadImage={vi.fn()}
        resolveImageUrl={vi.fn()}
      />,
    );

    expect(
      (await screen.findAllByRole('table')).some((table) => table.textContent?.includes('功能')),
    ).toBe(true);
    expect(screen.getByRole('columnheader', { name: '功能' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '完成' })).toBeInTheDocument();
  });

  it('uploads a pasted image and emits only its stable attachment URL in markdown', async () => {
    const onMarkdownChange = vi.fn();
    const uploadImage = vi.fn(async (_file: File) => 'attachment://attachment-1');
    const resolveImageUrl = vi.fn(
      async (_attachmentId: string) => 'https://signed.example/image.png',
    );
    render(
      <SubscriptionArticleEditor
        documentKey="new-1"
        initialMarkdown=""
        onMarkdownChange={onMarkdownChange}
        uploadImage={uploadImage}
        resolveImageUrl={resolveImageUrl}
      />,
    );
    const editorRoot = screen.getByTestId('subscription-article-editor');
    let textbox: HTMLElement | null = null;
    await waitFor(() => {
      textbox = editorRoot.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(textbox).not.toBeNull();
    });
    const image = new File(['png'], 'image.png', { type: 'image/png' });
    const clipboardFiles = {
      0: image,
      length: 1,
      item: (index: number) => (index === 0 ? image : null),
    };
    class TestClipboardEvent extends Event {}
    class TestDragEvent extends Event {}
    vi.stubGlobal('ClipboardEvent', TestClipboardEvent);
    vi.stubGlobal('DragEvent', TestDragEvent);
    const event = new TestClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: clipboardFiles, getData: () => '' },
    });

    fireEvent(textbox!, event);

    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const markdown = onMarkdownChange.mock.calls.at(-1)?.[0] as string | undefined;
      expect(markdown).toContain('attachment://attachment-1');
      expect(markdown).not.toContain('signed.example');
      expect(markdown).not.toContain('data:image');
    });
    expect(uploadImage.mock.calls[0]?.[0].name).toMatch(/^粘贴图片-\d+\.png$/u);
  });

  it('shows only one clear target while an image file is dragged over the article body', async () => {
    render(
      <SubscriptionArticleEditor
        documentKey="drag-image"
        initialMarkdown=""
        onMarkdownChange={vi.fn()}
        uploadImage={vi.fn()}
        resolveImageUrl={vi.fn()}
      />,
    );

    const editorRoot = screen.getByTestId('subscription-article-editor');
    let textbox: HTMLElement | null = null;
    await waitFor(() => {
      textbox = editorRoot.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(textbox).not.toBeNull();
    });
    const image = new File(['png'], 'dragged.png', { type: 'image/png' });
    const transfer = {
      files: {
        0: image,
        length: 1,
        item: (index: number) => (index === 0 ? image : null),
      },
      types: ['Files'],
    };

    fireEvent.dragEnter(textbox!, { dataTransfer: transfer });
    fireEvent.dragOver(textbox!, { dataTransfer: transfer });

    expect(screen.getAllByText('松开即可插入正文图片')).toHaveLength(1);

    fireEvent.dragLeave(textbox!, { dataTransfer: transfer, relatedTarget: document.body });
    expect(screen.queryByText('松开即可插入正文图片')).not.toBeInTheDocument();
  });
});
