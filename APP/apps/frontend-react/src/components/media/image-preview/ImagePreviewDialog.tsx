import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './ImagePreviewDialog.module.css';
import type { PreviewImage } from './useImagePreviewState';
import { privateMediaRepository } from '../../workspace/media/privateMediaRepository';

interface ImagePreviewDialogProps {
  activeDimensions: { width: number; height: number } | null;
  canPan: boolean;
  fitScale: number;
  image: PreviewImage;
  offset: { x: number; y: number };
  scale: number;
  stageRef: React.Ref<HTMLDivElement>;
  onClose: () => void;
  onImageLoad: (size: { width: number; height: number }) => void;
  onImagePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onWheel: (event: WheelEvent) => void;
}

type PreviewLoadStatus = 'loading' | 'loaded' | 'error';

export function ImagePreviewDialog({
  activeDimensions,
  canPan,
  fitScale,
  image,
  offset,
  scale,
  stageRef,
  onClose,
  onImageLoad,
  onImagePointerDown,
  onWheel,
}: ImagePreviewDialogProps) {
  const onWheelRef = useRef(onWheel);
  const [loadState, setLoadState] = useState<{
    src: string;
    attempt: number;
    status: PreviewLoadStatus;
  }>({ src: image.src, attempt: 0, status: 'loading' });
  const [cachedSource, setCachedSource] = useState<{
    src: string;
    attempt: number;
    objectUrl: string;
  } | null>(null);
  const activeLoadState =
    loadState.src === image.src
      ? loadState
      : { src: image.src, attempt: 0, status: 'loading' as const };
  onWheelRef.current = onWheel;

  useEffect(() => {
    if (!image.accessToken || !image.viewerId) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    void privateMediaRepository
      .acquirePreview({
        viewerId: image.viewerId,
        accessToken: image.accessToken,
        url: image.src,
        signal: controller.signal,
      })
      .then((lease) => {
        if (controller.signal.aborted) {
          lease.release();
          return;
        }
        release = lease.release;
        setCachedSource({ src: image.src, attempt: activeLoadState.attempt, objectUrl: lease.src });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn('Image preview failed:', error);
        setLoadState({ src: image.src, attempt: activeLoadState.attempt, status: 'error' });
      });
    return () => {
      controller.abort();
      release?.();
    };
  }, [image.accessToken, image.viewerId, image.src, activeLoadState.attempt]);

  const displaySource =
    image.accessToken && image.viewerId
      ? cachedSource?.src === image.src && cachedSource.attempt === activeLoadState.attempt
        ? cachedSource.objectUrl
        : null
      : image.src;

  useEffect(() => {
    const stage =
      typeof stageRef === 'function' ? null : (stageRef as React.RefObject<HTMLDivElement>).current;
    if (!stage) return;
    const handler = (e: WheelEvent) => onWheelRef.current(e);
    stage.addEventListener('wheel', handler, { passive: false });
    return () => stage.removeEventListener('wheel', handler);
  }, [stageRef]);

  return (
    <div
      className={styles.previewBackdrop}
      role="presentation"
      data-testid="image-preview-backdrop"
      onClick={onClose}
    >
      <div
        ref={stageRef}
        className={styles.previewStage}
        role="dialog"
        aria-modal="true"
        aria-label={image.alt}
        data-testid="image-preview-stage"
      >
        {activeLoadState.status !== 'loaded' ? (
          <div
            className={styles.previewLoadState}
            role={activeLoadState.status === 'error' ? 'alert' : 'status'}
            onClick={(event) => event.stopPropagation()}
          >
            {activeLoadState.status === 'loading' ? (
              <>
                <div className={styles.previewProgress} aria-hidden="true">
                  <span />
                </div>
                <strong>正在加载大图…</strong>
                <span>图片较大或网络较慢时可能需要一点时间</span>
              </>
            ) : (
              <>
                <strong>图片加载失败</strong>
                <span>请检查网络后重试</span>
                <button
                  className={styles.actionButton}
                  type="button"
                  onClick={() => {
                    setLoadState({
                      src: image.src,
                      attempt: activeLoadState.attempt + 1,
                      status: 'loading',
                    });
                  }}
                >
                  <IconRefresh size={16} />
                  重新加载
                </button>
              </>
            )}
          </div>
        ) : null}
        <button
          className={[styles.previewImageButton, canPan ? styles.previewImageButtonOriginal : '']
            .filter(Boolean)
            .join(' ')}
          type="button"
          disabled={activeLoadState.status !== 'loaded'}
          data-testid="image-preview-toggle"
          data-preview-offset={`${offset.x},${offset.y}`}
          data-preview-can-pan={canPan ? 'true' : 'false'}
          aria-label={image.alt}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (activeLoadState.status === 'loaded') onImagePointerDown(event);
          }}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px)`,
          }}
        >
          {displaySource ? (
            <img
              key={`${image.src}:${activeLoadState.attempt}`}
              className={styles.previewImage}
              src={displaySource}
              alt={image.alt}
              aria-hidden={activeLoadState.status !== 'loaded'}
              data-testid="image-preview-image"
              draggable={false}
              onLoad={(event) => {
                setLoadState({
                  src: image.src,
                  attempt: activeLoadState.attempt,
                  status: 'loaded',
                });
                onImageLoad({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
              onError={() => {
                if (image.viewerId && image.accessToken) {
                  privateMediaRepository.invalidatePreview(image.viewerId, image.src);
                }
                setLoadState({
                  src: image.src,
                  attempt: activeLoadState.attempt,
                  status: 'error',
                });
              }}
              style={
                activeDimensions
                  ? {
                      width: `${activeDimensions.width}px`,
                      height: `${activeDimensions.height}px`,
                    }
                  : undefined
              }
            />
          ) : null}
        </button>
      </div>
      <div
        className={styles.previewFooter}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <strong>{image.alt}</strong>
        <span className={styles.previewHint}>
          {`滚轮缩放${canPan ? '，拖拽移动' : ''} · ${Math.round(scale * 100)}%${fitScale < 1 ? '（初始完整显示）' : ''}`}
        </span>
        <div className={styles.previewFooterActions}>
          <button className={styles.actionButton} type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
