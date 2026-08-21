import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './MessagePane.module.css';
import type { PreviewImage } from '../media/image-preview/useImagePreviewState';
import { getMessageImageShellLayout } from './messageImageSizing';
import { useMessageMediaScheduler } from './media/MessageMediaProvider';
import { privateMediaRepository, type ThumbnailLease } from './media/privateMediaRepository';

interface ProtectedImageAttachmentProps {
  accessToken?: string;
  viewerId?: string;
  src: string;
  previewSrc?: string;
  alt: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  onLoad?: () => void;
  onPreview: (image: PreviewImage) => void;
  accessory?: ReactNode;
}

type ImageLoadState = 'loading' | 'loaded' | 'error';

function hasIntrinsicDimensions(width?: number | null, height?: number | null): boolean {
  return (
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height > 0
  );
}

function isGroupFileContentUrl(url: string) {
  return url.match(/\/groups\/([^/]+)\/files\/([^/]+)\/content/);
}

function isGroupFileThumbnailUrl(url: string) {
  return /\/groups\/[^/]+\/files\/[^/]+\/thumbnail(?:\?|$)/.test(url);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Get a presigned S3 view URL for the image.
 * The browser loads the image directly from object storage.
 */
export async function resolveImageUrl(
  url: string,
  accessToken: string,
  signal?: AbortSignal,
  viewerId = accessToken,
): Promise<string> {
  if (!isGroupFileContentUrl(url)) return url;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const resolved = await privateMediaRepository.resolveOriginalUrl({
    viewerId,
    accessToken,
    contentUrl: url,
  });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return resolved;
}

export function ProtectedImageAttachment({
  accessToken,
  viewerId,
  src,
  previewSrc,
  alt,
  imageWidth,
  imageHeight,
  onLoad,
  onPreview,
  accessory,
}: ProtectedImageAttachmentProps) {
  const loadId = useId();
  const scheduleMediaLoad = useMessageMediaScheduler();
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(null);
  const thumbnailLeaseRef = useRef<ThumbnailLease | null>(null);
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [loadState, setLoadState] = useState<ImageLoadState>('loading');
  const [sourceState, setSourceState] = useState<'primary' | 'fallback'>('primary');
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const [measuredDimensions, setMeasuredDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const currentSource = sourceState === 'primary' ? src : previewSrc || src;
  const effectiveDimensions = useMemo(() => {
    if (hasIntrinsicDimensions(imageWidth, imageHeight)) {
      return { width: imageWidth, height: imageHeight };
    }
    return measuredDimensions;
  }, [imageHeight, imageWidth, measuredDimensions]);
  const shellLayout = useMemo(
    () =>
      getMessageImageShellLayout(
        effectiveDimensions?.width ?? null,
        effectiveDimensions?.height ?? null,
      ),
    [effectiveDimensions],
  );

  useEffect(() => {
    setSourceState('primary');
    setLoadState('loading');
    setMeasuredDimensions(null);
  }, [previewSrc, src]);

  useEffect(() => {
    let cancelled = false;
    let ownedLease: ThumbnailLease | null = null;

    if (!currentSource) {
      setResolvedSrc('');
      setLoadState('error');
      return undefined;
    }
    setResolvedSrc('');
    setLoadState('loading');

    async function load(signal: AbortSignal) {
      try {
        if (!accessToken) {
          if (!cancelled && !signal.aborted) setResolvedSrc(currentSource);
          return;
        }

        if (isGroupFileThumbnailUrl(currentSource)) {
          ownedLease = await privateMediaRepository.acquireThumbnail({
            viewerId: viewerId ?? accessToken,
            accessToken,
            url: currentSource,
            signal,
          });
          if (cancelled || signal.aborted) {
            ownedLease.release();
            ownedLease = null;
            return;
          }
          thumbnailLeaseRef.current?.release();
          thumbnailLeaseRef.current = ownedLease;
          setResolvedSrc(ownedLease.src);
          return;
        }

        const nextSrc = await resolveImageUrl(
          currentSource,
          accessToken,
          signal,
          viewerId ?? accessToken,
        );
        if (!cancelled && !signal.aborted) setResolvedSrc(nextSrc);
      } catch (error) {
        if (cancelled || signal.aborted || isAbortError(error)) return;
        console.warn('Protected image load failed:', error);
        if (sourceState === 'primary' && previewSrc && previewSrc !== src) {
          setSourceState('fallback');
          return;
        }
        setLoadState('error');
      }
    }

    const controller = new AbortController();
    if (scheduleMediaLoad && !shellElement) return undefined;
    const cancelScheduled = scheduleMediaLoad
      ? scheduleMediaLoad({ id: loadId, element: shellElement!, run: load })
      : (() => {
          void load(controller.signal);
          return () => controller.abort();
        })();

    return () => {
      cancelled = true;
      cancelScheduled();
      if (ownedLease && thumbnailLeaseRef.current === ownedLease) {
        thumbnailLeaseRef.current.release();
        thumbnailLeaseRef.current = null;
      } else {
        ownedLease?.release();
      }
    };
  }, [
    accessToken,
    currentSource,
    loadId,
    previewSrc,
    scheduleMediaLoad,
    shellElement,
    sourceState,
    src,
    viewerId,
  ]);

  useEffect(() => {
    if (!resolvedSrc || hasIntrinsicDimensions(imageWidth, imageHeight) || measuredDimensions) {
      return;
    }

    const probe = new Image();
    let cancelled = false;

    const syncNaturalDimensions = () => {
      if (cancelled) return;
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setMeasuredDimensions({
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        });
      }
    };

    probe.onload = syncNaturalDimensions;
    probe.src = resolvedSrc;

    if (probe.complete) {
      syncNaturalDimensions();
    }

    return () => {
      cancelled = true;
      probe.onload = null;
    };
  }, [imageHeight, imageWidth, measuredDimensions, resolvedSrc]);

  function handleImageError() {
    if (sourceState === 'primary' && previewSrc && previewSrc !== src) {
      setSourceState('fallback');
      return;
    }
    setLoadState('error');
  }

  async function handleClick() {
    if (isOpeningPreview) return;
    setIsOpeningPreview(true);

    try {
      const previewTarget = previewSrc || src || resolvedSrc;
      if (!previewTarget || !accessToken) {
        onPreview({ src: previewTarget || resolvedSrc, alt });
        return;
      }

      const previewUrl = isGroupFileThumbnailUrl(previewTarget)
        ? resolvedSrc
        : await resolveImageUrl(previewTarget, accessToken, undefined, viewerId ?? accessToken);
      onPreview({ src: previewUrl, alt });
    } catch (error) {
      if (isAbortError(error)) return;
      console.warn('Image preview failed:', error);
      setLoadState('error');
    } finally {
      setIsOpeningPreview(false);
    }
  }

  return (
    <div
      className={styles.imageAttachmentLayout}
      style={{ width: `min(100%, ${shellLayout.widthPx}px)` }}
    >
      <div
        ref={setShellElement}
        className={styles.imageAttachmentShell}
        data-testid="image-attachment-shell"
        style={{
          width: `min(100%, ${shellLayout.widthPx}px)`,
          aspectRatio: shellLayout.aspectRatio,
        }}
      >
        <button
          className={styles.imageAttachment}
          type="button"
          onClick={handleClick}
          aria-label={resolvedSrc || loadState === 'error' ? `全屏查看 ${alt}` : `${alt} 加载中`}
        >
          {resolvedSrc ? (
            <img
              src={resolvedSrc}
              alt={alt}
              onLoad={(event) => {
                if (!hasIntrinsicDimensions(imageWidth, imageHeight)) {
                  const naturalWidth = event.currentTarget.naturalWidth;
                  const naturalHeight = event.currentTarget.naturalHeight;
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setMeasuredDimensions({ width: naturalWidth, height: naturalHeight });
                  }
                }
                setLoadState('loaded');
                onLoad?.();
              }}
              onError={handleImageError}
            />
          ) : (
            <div className={styles.imagePlaceholder} data-testid="image-attachment-placeholder">
              {loadState === 'error' ? '图片加载失败' : '图片加载中...'}
            </div>
          )}
        </button>
      </div>
      {accessory ? <div className={styles.imageAttachmentAccessory}>{accessory}</div> : null}
    </div>
  );
}
