import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALBUM_VIDEO_MAX_MB } from '@sekerchat/shared';
import { resolveApiResourceUrl } from '../../../lib/api-core';
import {
  deleteAlbumPhotos,
  listAlbumPhotos,
  listAlbumTags,
  markAlbumViewed,
  uploadAlbumPhoto,
  type AlbumPhoto,
} from '../../../lib/album-api';
import { ImagePreviewDialog } from '../../media/image-preview/ImagePreviewDialog';
import { hasDraggedFiles } from '../useWorkspaceFileDrop';
import { useImagePreviewState } from '../../media/image-preview/useImagePreviewState';
import {
  buildAlbumViewportIndex,
  getAlbumColumnCount,
  layoutAlbumPhotos,
  selectVisibleAlbumPhotosFromIndex,
} from './album-layout';
import styles from './DmAlbumPage.module.css';
import { AlbumVideoPreviewDialog } from './AlbumVideoPreviewDialog';
import { AlbumVideoTile } from './AlbumVideoTile';

interface DmAlbumPageProps {
  accessToken: string;
  canManage: boolean;
}

const ALBUM_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif)$/i;
const ALBUM_VIDEO_EXTENSION_PATTERN = /\.mp4$/i;
const ALBUM_VIDEO_MAX_BYTES = ALBUM_VIDEO_MAX_MB * 1024 * 1024;

function isAlbumVideoFile(file: File): boolean {
  return file.type === 'video/mp4' || (!file.type && ALBUM_VIDEO_EXTENSION_PATTERN.test(file.name));
}

function isAlbumMediaFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    isAlbumVideoFile(file) ||
    (!file.type && ALBUM_IMAGE_EXTENSION_PATTERN.test(file.name))
  );
}

export function DmAlbumPage({ accessToken, canManage }: DmAlbumPageProps) {
  const queryClient = useQueryClient();
  const pageRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(0);
  const hasReportedContentReadyRef = useRef(false);
  const [activeTag, setActiveTag] = useState('');
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(() => new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<AlbumPhoto | null>(null);
  const imagePreview = useImagePreviewState();

  const tagsQuery = useQuery({
    queryKey: ['album', 'tags'],
    queryFn: () => listAlbumTags(accessToken),
    staleTime: 30_000,
  });
  const photosQuery = useInfiniteQuery({
    queryKey: ['album', 'photos', activeTag],
    queryFn: ({ pageParam }) =>
      listAlbumPhotos(accessToken, {
        cursor: pageParam || undefined,
        tag: activeTag || undefined,
        limit: 30,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const photos = useMemo(() => {
    const uniquePhotos = new Map<string, AlbumPhoto>();
    photosQuery.data?.pages.forEach((page) => {
      page.items.forEach((photo) => uniquePhotos.set(photo.id, photo));
    });
    return [...uniquePhotos.values()];
  }, [photosQuery.data]);

  useEffect(() => {
    if (!photosQuery.isSuccess || hasReportedContentReadyRef.current) return;
    hasReportedContentReadyRef.current = true;
    queryClient.setQueryData(['album', 'update-status'], { hasUpdates: false });
    void markAlbumViewed(accessToken).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ['album', 'update-status'] });
    });
  }, [accessToken, photosQuery.isSuccess, queryClient]);

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width - 2);
      if (Number.isFinite(entry.contentRect.height) && entry.contentRect.height > 0) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && photosQuery.hasNextPage && !photosQuery.isFetchingNextPage) {
          void photosQuery.fetchNextPage();
        }
      },
      { root: pageRef.current, rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [photosQuery.fetchNextPage, photosQuery.hasNextPage, photosQuery.isFetchingNextPage]);

  const gap = containerWidth < 640 ? 7 : 10;
  const layout = useMemo(
    () =>
      containerWidth
        ? layoutAlbumPhotos(photos, {
            containerWidth,
            columnCount: getAlbumColumnCount(containerWidth),
            gap,
          })
        : { items: [], columnWidth: 0, columnHeights: [0] },
    [containerWidth, gap, photos],
  );
  const viewportIndex = useMemo(() => buildAlbumViewportIndex(layout.items), [layout.items]);
  const visiblePhotos = useMemo(
    () =>
      selectVisibleAlbumPhotosFromIndex(viewportIndex, {
        scrollTop,
        viewportHeight,
        overscan: Math.max(1_200, viewportHeight * 2),
      }),
    [scrollTop, viewportHeight, viewportIndex],
  );
  const photoIndexById = useMemo(
    () => new Map(photos.map((photo, index) => [photo.id, index])),
    [photos],
  );
  const gridHeight = Math.max(...layout.columnHeights, 0);

  const selectTag = (tag: string) => {
    setActiveTag((currentTag) => (currentTag === tag ? '' : tag));
    pageRef.current?.scrollTo?.(0, 0);
  };

  const handleScroll = (nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollTop(pendingScrollTopRef.current);
    });
  };

  const refreshAlbum = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['album', 'photos'] }),
      queryClient.invalidateQueries({ queryKey: ['album', 'tags'] }),
    ]);
  };

  const finishManaging = () => {
    setIsManaging(false);
    setSelectedPhotoIds(new Set());
    setDeleteStatus(null);
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotoIds((current) => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const deleteSelectedPhotos = async () => {
    const photoIds = [...selectedPhotoIds];
    if (photoIds.length === 0 || isDeleting) return;
    if (!window.confirm(`确认删除已选的 ${photoIds.length} 张照片？`)) return;
    setIsDeleting(true);
    setDeleteStatus(null);
    try {
      const result = await deleteAlbumPhotos(accessToken, photoIds);
      setSelectedPhotoIds(new Set());
      setDeleteStatus(`已删除 ${result.deletedCount} 张`);
      await refreshAlbum();
    } catch (error) {
      setDeleteStatus(error instanceof Error ? `删除失败：${error.message}` : '删除失败，请重试');
    } finally {
      setIsDeleting(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    const mediaFiles = files.filter(isAlbumMediaFile);
    if (mediaFiles.length === 0) {
      setUploadStatus('相册只支持图片和 MP4 视频');
      return;
    }
    if (mediaFiles.some((file) => isAlbumVideoFile(file) && file.size > ALBUM_VIDEO_MAX_BYTES)) {
      setUploadStatus(`相册视频大小不能超过 ${ALBUM_VIDEO_MAX_MB}MB`);
      return;
    }
    try {
      let duplicateCount = 0;
      const failedFiles: Array<{ name: string; message: string }> = [];
      for (const [index, file] of mediaFiles.entries()) {
        try {
          const photo = await uploadAlbumPhoto(accessToken, file, (progress) => {
            setUploadStatus(
              `正在上传 ${index + 1}/${mediaFiles.length} · ${Math.round(progress.percent)}%`,
            );
          });
          if (photo.duplicate) duplicateCount += 1;
        } catch (error) {
          failedFiles.push({
            name: file.name,
            message: error instanceof Error ? error.message : '上传失败',
          });
        }
      }
      const uploadedCount = mediaFiles.length - duplicateCount - failedFiles.length;
      if (uploadedCount > 0 || duplicateCount > 0) await refreshAlbum();
      if (failedFiles.length > 0) {
        const firstFailure = failedFiles[0]!;
        setUploadStatus(
          `已上传 ${uploadedCount} 个，失败 ${failedFiles.length} 个：${firstFailure.name} · ${firstFailure.message}`,
        );
      } else {
        setUploadStatus(
          duplicateCount === 0
            ? '上传完成'
            : uploadedCount === 0
              ? `已忽略 ${duplicateCount} 个重复媒体`
              : `已上传 ${uploadedCount} 个，忽略 ${duplicateCount} 个重复媒体`,
        );
        window.setTimeout(() => setUploadStatus(null), 1600);
      }
    } catch (error) {
      setUploadStatus(error instanceof Error ? `上传失败：${error.message}` : '上传失败，请重试');
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!canManage || isManaging || !hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!canManage || isManaging || !hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canManage || isManaging || !hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canManage || isManaging || !hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    const files = [...(event.dataTransfer.files ?? [])];
    if (files.length > 0) void uploadFiles(files);
  };

  return (
    <div
      className={styles.page}
      ref={pageRef}
      data-testid="album-drop-zone"
      data-workspace-file-drop="local"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onScroll={(event) => handleScroll(event.currentTarget.scrollTop)}
    >
      {tagsQuery.data?.length || uploadStatus || canManage ? (
        <div className={styles.toolbar}>
          <div className={styles.tags} aria-label="相册标签筛选">
            {tagsQuery.data?.map((tag) => (
              <button
                key={tag.id}
                className={activeTag === tag.normalizedName ? styles.active : ''}
                onClick={() => selectTag(tag.normalizedName)}
              >
                {tag.name}
              </button>
            ))}
          </div>
          {uploadStatus ? <span className={styles.uploadStatus}>{uploadStatus}</span> : null}
          {canManage ? (
            isManaging ? (
              <div className={styles.manageActions}>
                <span className={styles.selectionCount}>已选择 {selectedPhotoIds.size} 张</span>
                {deleteStatus ? <span className={styles.deleteStatus}>{deleteStatus}</span> : null}
                <button
                  className={styles.deleteButton}
                  disabled={selectedPhotoIds.size === 0 || isDeleting}
                  onClick={() => void deleteSelectedPhotos()}
                >
                  {isDeleting ? '正在删除…' : `删除已选（${selectedPhotoIds.size}）`}
                </button>
                <button onClick={finishManaging}>完成</button>
              </div>
            ) : (
              <button
                className={styles.manageEntry}
                onClick={() => {
                  setIsManaging(true);
                  setDeleteStatus(null);
                }}
              >
                管理
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {canManage && isDragActive ? (
        <div className={styles.dropOverlay}>拖拽图片或 MP4 视频到这里上传</div>
      ) : null}

      {photosQuery.isPending ? (
        <div className={styles.state}>正在加载相册…</div>
      ) : photosQuery.isError ? (
        <div className={styles.state}>
          <button onClick={() => void photosQuery.refetch()}>加载失败，重试</button>
        </div>
      ) : photos.length === 0 ? (
        <div className={styles.state}>相册里还没有照片</div>
      ) : (
        <div className={styles.grid} style={{ height: gridHeight }}>
          {visiblePhotos.map((photo) => {
            const index = photoIndexById.get(photo.id) ?? 0;
            const isVideo = photo.mediaType === 'video' || photo.mimeType === 'video/mp4';
            const contentUrl = resolveApiResourceUrl(photo.contentUrl);
            const thumbnailUrl = photo.thumbnailUrl
              ? resolveApiResourceUrl(photo.thumbnailUrl)
              : null;
            const mediaLabel = isVideo ? '视频' : '图片';
            return (
              <button
                className={`${styles.tile} ${selectedPhotoIds.has(photo.id) ? styles.selected : ''}`}
                key={photo.id}
                aria-label={`${isManaging ? '选择' : '查看'}相册${mediaLabel} ${index + 1}`}
                aria-pressed={isManaging ? selectedPhotoIds.has(photo.id) : undefined}
                onClick={() => {
                  if (isManaging) {
                    togglePhotoSelection(photo.id);
                    return;
                  }
                  if (isVideo) {
                    setPreviewVideo(photo);
                    return;
                  }
                  imagePreview.setPreviewImage({
                    src: contentUrl,
                    alt: `相册图片 ${index + 1}`,
                  });
                }}
                style={{
                  left: photo.column * (layout.columnWidth + gap),
                  top: photo.top,
                  width: layout.columnWidth,
                  height: photo.height,
                }}
              >
                {isVideo ? (
                  <AlbumVideoTile
                    active={activeVideoId === photo.id && previewVideo === null}
                    contentUrl={contentUrl}
                    index={index + 1}
                    posterUrl={thumbnailUrl}
                    suspended={isManaging || previewVideo !== null}
                    onActivate={() => setActiveVideoId(photo.id)}
                    onDeactivate={() =>
                      setActiveVideoId((current) => (current === photo.id ? null : current))
                    }
                  />
                ) : (
                  <img
                    src={thumbnailUrl ?? contentUrl}
                    alt={`相册图片 ${index + 1}`}
                    loading="lazy"
                  />
                )}
                {isManaging ? (
                  <span className={styles.selectionMark} aria-hidden="true">
                    {selectedPhotoIds.has(photo.id) ? '✓' : ''}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div ref={sentinelRef} className={styles.sentinel} />
      {photosQuery.isFetchingNextPage ? (
        <div className={styles.paginationState}>正在加载更多…</div>
      ) : null}
      {photosQuery.isFetchNextPageError ? (
        <div className={styles.paginationState}>
          <button onClick={() => void photosQuery.fetchNextPage()}>更多照片加载失败，重试</button>
        </div>
      ) : null}

      {imagePreview.previewImage ? (
        <ImagePreviewDialog
          activeDimensions={imagePreview.activeDimensions}
          canPan={imagePreview.canPan}
          fitScale={imagePreview.fitScale}
          image={imagePreview.previewImage}
          offset={imagePreview.previewOffset}
          scale={imagePreview.previewScale}
          stageRef={imagePreview.previewStageRef}
          onClose={imagePreview.closePreview}
          onImageLoad={imagePreview.setPreviewNaturalSize}
          onImagePointerDown={imagePreview.handlePreviewPointerDown}
          onWheel={imagePreview.handlePreviewWheel}
        />
      ) : null}
      {previewVideo ? (
        <AlbumVideoPreviewDialog
          src={resolveApiResourceUrl(previewVideo.contentUrl)}
          poster={
            previewVideo.thumbnailUrl ? resolveApiResourceUrl(previewVideo.thumbnailUrl) : null
          }
          onClose={() => setPreviewVideo(null)}
        />
      ) : null}
    </div>
  );
}
