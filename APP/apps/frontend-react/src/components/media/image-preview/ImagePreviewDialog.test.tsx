import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImagePreviewDialog } from './ImagePreviewDialog';
import { privateMediaRepository } from '../../workspace/media/privateMediaRepository';

function renderDialog(overrides: Partial<Parameters<typeof ImagePreviewDialog>[0]> = {}) {
  const onImageLoad = vi.fn();
  const props: Parameters<typeof ImagePreviewDialog>[0] = {
    activeDimensions: null,
    canPan: false,
    fitScale: 1,
    image: { src: '/api/files/file-1/content', alt: '灵感图.png' },
    offset: { x: 0, y: 0 },
    scale: 1,
    stageRef: createRef<HTMLDivElement>(),
    onClose: vi.fn(),
    onImageLoad,
    onImagePointerDown: vi.fn(),
    onWheel: vi.fn(),
    ...overrides,
  };

  return { ...render(<ImagePreviewDialog {...props} />), onImageLoad };
}

describe('shared ImagePreviewDialog', () => {
  afterEach(() => vi.restoreAllMocks());
  it('shows actual download percentage and decoding separately, then removes progress', async () => {
    let report!: (value: { loaded: number; total: number | null }) => void;
    let finish!: (lease: { src: string; release: () => void }) => void;
    const acquire = vi.spyOn(privateMediaRepository, 'acquirePreview').mockImplementation(({ onProgress }) => {
      report = onProgress!;
      return new Promise((resolve) => { finish = resolve; });
    });
    const view = renderDialog({ image: { src: '/api/groups/g/files/f/content', alt: 'large', accessToken: 'token', viewerId: 'user' } });
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    act(() => report({ loaded: 1024, total: 4096 }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByRole('status')).toHaveTextContent('25%');
    expect(screen.getByRole('status')).toHaveTextContent('1.0 KB / 4.0 KB');
    await act(async () => finish({ src: 'blob:large', release: vi.fn() }));
    expect(screen.getByRole('status')).toHaveTextContent('正在解析图片');
    fireEvent.load(screen.getByTestId('image-preview-image'));
    expect(screen.queryByRole('progressbar')).toBeNull();
    view.unmount();
    acquire.mockRestore();
  });

  it('shows unknown-length bytes and resets progress when retrying a failed download', async () => {
    let report!: (value: { loaded: number; total: number | null }) => void;
    let fail!: (error: Error) => void;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(privateMediaRepository, 'acquirePreview').mockImplementation(({ onProgress }) => {
      report = onProgress!;
      return new Promise((_resolve, reject) => { fail = reject; });
    });
    const view = renderDialog({ image: { src: '/api/groups/g/files/f/content', alt: 'large', accessToken: 'token', viewerId: 'user' } });
    act(() => report({ loaded: 2048, total: null }));
    expect(screen.getByRole('status')).toHaveTextContent('已接收 2.0 KB');
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    await act(async () => fail(new Error('network failed')));
    expect(screen.getByRole('alert')).toHaveTextContent('图片加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(screen.getByRole('status')).toHaveTextContent('正在连接图片');
    expect(screen.getByRole('status')).not.toHaveTextContent('2.0 KB');
    view.unmount();
  });

  it('uses a leased original, releases it on close, and loads a changed image', async () => {
    const release = vi.fn();
    const acquire = vi
      .spyOn(privateMediaRepository, 'acquirePreview')
      .mockImplementation(async ({ url }) => ({
        src: `blob:${url}`,
        release,
      }));
    const firstImage = {
      src: '/api/groups/g/files/one/content',
      alt: 'one',
      accessToken: 'token',
      viewerId: 'user',
    };
    const view = renderDialog({ image: firstImage });
    await waitFor(() =>
      expect(screen.getByTestId('image-preview-image')).toHaveAttribute(
        'src',
        `blob:${firstImage.src}`,
      ),
    );
    view.rerender(
      <ImagePreviewDialog
        activeDimensions={null}
        canPan={false}
        fitScale={1}
        image={{ ...firstImage, src: '/api/groups/g/files/two/content' }}
        offset={{ x: 0, y: 0 }}
        scale={1}
        stageRef={createRef<HTMLDivElement>()}
        onClose={vi.fn()}
        onImageLoad={vi.fn()}
        onImagePointerDown={vi.fn()}
        onWheel={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('image-preview-image')).toHaveAttribute(
        'src',
        'blob:/api/groups/g/files/two/content',
      ),
    );
    expect(release).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(release).toHaveBeenCalledTimes(2);
    expect(acquire).toHaveBeenCalledTimes(2);
    acquire.mockRestore();
  });

  it('keeps loading, retry and source-change behavior independent from workspace UI', () => {
    const { onImageLoad, rerender } = renderDialog();
    const firstImage = screen.getByTestId('image-preview-image');
    expect(screen.getByRole('status')).toHaveTextContent('正在加载大图…');

    fireEvent.error(firstImage);
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(screen.getByTestId('image-preview-image')).not.toBe(firstImage);

    fireEvent.load(screen.getByTestId('image-preview-image'));
    expect(onImageLoad).toHaveBeenCalledTimes(1);

    rerender(
      <ImagePreviewDialog
        activeDimensions={null}
        canPan={false}
        fitScale={1}
        image={{ src: '/api/files/file-2/content', alt: '第二张.png' }}
        offset={{ x: 0, y: 0 }}
        scale={1}
        stageRef={createRef<HTMLDivElement>()}
        onClose={vi.fn()}
        onImageLoad={vi.fn()}
        onImagePointerDown={vi.fn()}
        onWheel={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('正在加载大图…');
  });
});
