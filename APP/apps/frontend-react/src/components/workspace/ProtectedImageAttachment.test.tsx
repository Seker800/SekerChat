import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedImageAttachment } from './ProtectedImageAttachment';
import { clearPrivateMediaCache } from './media/privateMediaRepository';

describe('ProtectedImageAttachment', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
  });

  afterEach(() => {
    cleanup();
    clearPrivateMediaCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the URL directly when no accessToken is provided', () => {
    render(
      <ProtectedImageAttachment
        src="http://localhost:3000/files/evidence-thumb.jpg"
        previewSrc="http://localhost:3000/files/evidence.png"
        alt="evidence.png"
        onPreview={() => undefined}
      />,
    );

    const image = screen.getByAltText('evidence.png');
    expect(image).toHaveAttribute('src', 'http://localhost:3000/files/evidence-thumb.jpg');
  });

  it('shows loading state while resolving presigned URL', () => {
    render(
      <ProtectedImageAttachment
        accessToken="token-1"
        src="http://localhost:3000/api/groups/group-1/files/thumb/content"
        imageWidth={1200}
        imageHeight={600}
        alt="evidence.png"
        onPreview={() => undefined}
      />,
    );

    expect(screen.getByTestId('image-attachment-placeholder')).toHaveTextContent('图片加载中...');
  });

  it('reserves a stable media shell from intrinsic dimensions before the bitmap resolves', () => {
    render(
      <ProtectedImageAttachment
        accessToken="token-1"
        src="http://localhost:3000/api/groups/group-1/files/thumb/content"
        imageWidth={1200}
        imageHeight={600}
        alt="evidence.png"
        onPreview={() => undefined}
      />,
    );

    expect(screen.getByTestId('image-attachment-shell')).toHaveStyle({
      aspectRatio: '420 / 210',
      width: 'min(100%, 420px)',
    });
  });

  it('opens preview with the presigned view URL', async () => {
    const onPreview = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('view-url')) {
        return new Response(JSON.stringify({ url: 'https://media.example.test/bucket/original.jpg' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    }));

    render(
      <ProtectedImageAttachment
        accessToken="token-1"
        src="http://localhost:3000/api/groups/group-1/files/thumb/content"
        previewSrc="http://localhost:3000/api/groups/group-1/files/original/content"
        alt="evidence.png"
        onPreview={onPreview}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(onPreview).toHaveBeenCalledWith({
        src: 'https://media.example.test/bucket/original.jpg',
        alt: 'evidence.png',
      });
    });
  });

  it('downloads the stable thumbnail once and reuses it after remount', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/thumbnail')) {
        return new Response(new Blob(['small-thumbnail'], { type: 'image/jpeg' }), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:stable-thumbnail'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    const props = {
      accessToken: 'token-1',
      viewerId: 'user-1',
      src: 'http://localhost:3000/api/groups/group-1/files/file-1/thumbnail',
      previewSrc: 'http://localhost:3000/api/groups/group-1/files/file-1/content',
      alt: 'evidence.png',
      onPreview: () => undefined,
    };
    const first = render(<ProtectedImageAttachment {...props} />);
    expect(await screen.findByAltText('evidence.png')).toHaveAttribute('src', 'blob:stable-thumbnail');
    first.unmount();
    render(<ProtectedImageAttachment {...props} />);
    expect(await screen.findByAltText('evidence.png')).toHaveAttribute('src', 'blob:stable-thumbnail');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(props.src);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/download-url'))).toBe(false);
  });

  it('recomputes legacy image shell height from the loaded bitmap when metadata is missing', () => {
    render(
      <ProtectedImageAttachment
        src="http://localhost:3000/files/evidence-thumb.jpg"
        alt="evidence.png"
        onPreview={() => undefined}
      />,
    );

    const shell = screen.getByTestId('image-attachment-shell');
    expect(shell).toHaveStyle({ width: 'min(100%, 320px)', aspectRatio: '320 / 160' });

    const image = screen.getByAltText('evidence.png');
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 900 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 2400 });

    fireEvent.load(image);

    expect(shell).toHaveStyle({ width: 'min(100%, 120px)', aspectRatio: '120 / 320' });
  });
});
