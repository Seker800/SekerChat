import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DmAlbumPage } from './DmAlbumPage';

const listAlbumPhotos = vi.fn();
const listAlbumTags = vi.fn();
const uploadAlbumPhoto = vi.fn();
const deleteAlbumPhotos = vi.fn();
const markAlbumViewed = vi.fn();
vi.mock('../../../lib/album-api', () => ({
  listAlbumPhotos: (...args: unknown[]) => listAlbumPhotos(...args),
  listAlbumTags: (...args: unknown[]) => listAlbumTags(...args),
  uploadAlbumPhoto: (...args: unknown[]) => uploadAlbumPhoto(...args),
  deleteAlbumPhotos: (...args: unknown[]) => deleteAlbumPhotos(...args),
  markAlbumViewed: (...args: unknown[]) => markAlbumViewed(...args),
}));

function renderPage(canManage = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DmAlbumPage accessToken="token" canManage={canManage} />
    </QueryClientProvider>,
  );
}

describe('DmAlbumPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: ResizeObserverCallback) {}
        observe() {
          this.callback(
            [{ contentRect: { width: 1000 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
        unobserve() {}
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor() {}
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
        root = null;
        rootMargin = '';
        thresholds = [];
      },
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    listAlbumTags.mockResolvedValue([
      { id: 't1', name: '团建', normalizedName: '团建', photoCount: 1 },
    ]);
    listAlbumPhotos.mockResolvedValue({
      items: [
        {
          id: 'p1',
          width: 800,
          height: 1200,
          createdAt: '2026-08-13T00:00:00Z',
          thumbnailUrl: '/thumb',
          contentUrl: '/content',
        },
        {
          id: 'p2',
          width: 1200,
          height: 800,
          createdAt: '2026-08-12T00:00:00Z',
          thumbnailUrl: '/thumb-2',
          contentUrl: '/content-2',
        },
        {
          id: 'v1',
          mediaType: 'video',
          mimeType: 'video/mp4',
          durationMs: 12_000,
          width: 1920,
          height: 1080,
          createdAt: '2026-08-11T00:00:00Z',
          thumbnailUrl: null,
          contentUrl: '/video-content',
        },
      ],
      nextCursor: null,
    });
    uploadAlbumPhoto.mockResolvedValue({ duplicate: false });
    deleteAlbumPhotos.mockResolvedValue({ requestedCount: 2, deletedCount: 2 });
    markAlbumViewed.mockResolvedValue({ hasUpdates: false });
  });

  it('renders pure image tiles, filters by tags, and reuses the channel image preview', async () => {
    renderPage();
    const image = await screen.findByRole('img', { name: '相册图片 1' });
    expect(image).toBeInTheDocument();
    expect(screen.queryByText('2026-08-13')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '全部' })).not.toBeInTheDocument();
    expect(screen.queryByText('上传')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '团建' }));
    await waitFor(() =>
      expect(listAlbumPhotos).toHaveBeenLastCalledWith(
        'token',
        expect.objectContaining({ tag: '团建' }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: '查看相册图片 1' }));
    expect(screen.getByTestId('image-preview-stage')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭大图' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('照片标签')).not.toBeInTheDocument();
  });

  it('reports the album as viewed only after its first page loads successfully', async () => {
    renderPage();

    expect(markAlbumViewed).not.toHaveBeenCalled();
    await screen.findByRole('img', { name: '相册图片 1' });
    await waitFor(() => expect(markAlbumViewed).toHaveBeenCalledTimes(1));
    expect(markAlbumViewed).toHaveBeenCalledWith('token');
  });

  it('keeps the album update unread when its first page fails to load', async () => {
    listAlbumPhotos.mockRejectedValue(new Error('album unavailable'));
    renderPage();

    expect(await screen.findByRole('button', { name: '加载失败，重试' })).toBeInTheDocument();
    expect(markAlbumViewed).not.toHaveBeenCalled();
  });

  it('shows a page-local image drop target and uploads only for managers', async () => {
    const { rerender } = renderPage(false);
    await screen.findByRole('img', { name: '相册图片 1' });
    const dropZone = screen.getByTestId('album-drop-zone');
    const imageFile = new File(['image'], 'photo.png', { type: 'image/png' });
    const dataTransfer = { types: ['Files'], files: [imageFile], dropEffect: 'none' };

    fireEvent.dragEnter(dropZone, { dataTransfer });
    expect(screen.queryByText('拖拽图片到这里上传')).not.toBeInTheDocument();
    fireEvent.drop(dropZone, { dataTransfer });
    expect(uploadAlbumPhoto).not.toHaveBeenCalled();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DmAlbumPage accessToken="token" canManage />
      </QueryClientProvider>,
    );
    const managerDropZone = screen.getByTestId('album-drop-zone');
    fireEvent.dragEnter(managerDropZone, { dataTransfer });
    expect(screen.getByText('拖拽图片或 MP4 视频到这里上传')).toBeInTheDocument();
    fireEvent.drop(managerDropZone, { dataTransfer });
    await waitFor(() =>
      expect(uploadAlbumPhoto).toHaveBeenCalledWith('token', imageFile, expect.any(Function)),
    );
  });

  it('accepts a supported image extension when the browser omits File.type', async () => {
    renderPage(true);
    await screen.findByRole('img', { name: '相册图片 1' });
    const imageFile = new File(['image'], 'camera-export.JPEG', { type: '' });
    const dataTransfer = { types: ['Files'], files: [imageFile], dropEffect: 'none' };

    fireEvent.drop(screen.getByTestId('album-drop-zone'), { dataTransfer });

    await waitFor(() =>
      expect(uploadAlbumPhoto).toHaveBeenCalledWith('token', imageFile, expect.any(Function)),
    );
  });

  it('reports duplicate uploads as ignored and continues the batch', async () => {
    uploadAlbumPhoto
      .mockResolvedValueOnce({ duplicate: true })
      .mockResolvedValueOnce({ duplicate: false });
    renderPage(true);
    await screen.findByRole('img', { name: '相册图片 1' });
    const first = new File(['same'], 'duplicate.png', { type: 'image/png' });
    const second = new File(['new'], 'new.png', { type: 'image/png' });

    fireEvent.drop(screen.getByTestId('album-drop-zone'), {
      dataTransfer: { types: ['Files'], files: [first, second], dropEffect: 'none' },
    });

    expect(await screen.findByText('已上传 1 个，忽略 1 个重复媒体')).toBeInTheDocument();
    expect(uploadAlbumPhoto).toHaveBeenCalledTimes(2);
  });

  it('uploads MP4 files without eagerly loading their original content', async () => {
    renderPage(true);
    const video = (await screen.findByLabelText('相册视频 3')) as HTMLVideoElement;
    expect(video).not.toHaveAttribute('poster');
    expect(video).not.toHaveAttribute('src');
    expect(video).toHaveAttribute('preload', 'none');
    const videoFile = new File(['video'], 'summer.mp4', { type: 'video/mp4' });
    const dataTransfer = { types: ['Files'], files: [videoFile], dropEffect: 'none' };

    fireEvent.drop(screen.getByTestId('album-drop-zone'), { dataTransfer });
    await waitFor(() =>
      expect(uploadAlbumPhoto).toHaveBeenCalledWith('token', videoFile, expect.any(Function)),
    );

    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('loop');
    expect(video).not.toHaveAttribute('src');
  });

  it('continues a batch after an unsupported video and reports a summary', async () => {
    uploadAlbumPhoto
      .mockRejectedValueOnce(new Error('相册 MP4 视频必须使用 H.264 编码。'))
      .mockResolvedValueOnce({ duplicate: false });
    renderPage(true);
    await screen.findByRole('img', { name: '相册图片 1' });
    const unsupported = new File(['video'], 'hevc.mp4', { type: 'video/mp4' });
    const image = new File(['image'], 'photo.png', { type: 'image/png' });

    fireEvent.drop(screen.getByTestId('album-drop-zone'), {
      dataTransfer: { types: ['Files'], files: [unsupported, image], dropEffect: 'none' },
    });

    expect(
      await screen.findByText(
        '已上传 1 个，失败 1 个：hevc.mp4 · 相册 MP4 视频必须使用 H.264 编码。',
      ),
    ).toBeInTheDocument();
    expect(uploadAlbumPhoto).toHaveBeenCalledTimes(2);
  });

  it('rejects MP4 files larger than 100MB before uploading', async () => {
    renderPage(true);
    const oversizedVideo = new File(['video'], 'oversized.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversizedVideo, 'size', { value: 100 * 1024 * 1024 + 1 });

    fireEvent.drop(screen.getByTestId('album-drop-zone'), {
      dataTransfer: { types: ['Files'], files: [oversizedVideo], dropEffect: 'none' },
    });

    expect(await screen.findByText('相册视频大小不能超过 100MB')).toBeInTheDocument();
    expect(uploadAlbumPhoto).not.toHaveBeenCalled();
  });

  it('opens an MP4 with playback controls when its tile is clicked', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '查看相册视频 3' }));

    const preview = screen.getByLabelText('相册视频预览');
    expect(preview).toHaveAttribute('controls');
    expect(preview).toHaveAttribute('src', '/video-content');
  });

  it('shows one management entry only to managers and batch deletes selected photos', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { unmount } = renderPage(false);
    await screen.findByRole('img', { name: '相册图片 1' });
    expect(screen.queryByRole('button', { name: '管理' })).not.toBeInTheDocument();
    unmount();

    renderPage(true);
    const manageButton = await screen.findByRole('button', { name: '管理' });
    fireEvent.click(manageButton);
    fireEvent.click(screen.getByRole('button', { name: '选择相册图片 1' }));
    fireEvent.click(screen.getByRole('button', { name: '选择相册图片 2' }));
    expect(screen.queryByTestId('image-preview-stage')).not.toBeInTheDocument();
    expect(screen.getByText('已选择 2 张')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除已选（2）' }));
    await waitFor(() => expect(deleteAlbumPhotos).toHaveBeenCalledWith('token', ['p1', 'p2']));
    expect(confirm).toHaveBeenCalledWith('确认删除已选的 2 张照片？');
  });
});
