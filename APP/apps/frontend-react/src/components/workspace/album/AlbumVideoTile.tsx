import { useEffect, useRef } from 'react';
import styles from './DmAlbumPage.module.css';

interface AlbumVideoTileProps {
  active: boolean;
  contentUrl: string;
  index: number;
  posterUrl: string | null;
  suspended: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}

const HOVER_PLAY_DELAY_MS = 200;

export function AlbumVideoTile({
  active,
  contentUrl,
  index,
  posterUrl,
  suspended,
  onActivate,
  onDeactivate,
}: AlbumVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const clearHoverTimer = () => {
    if (hoverTimerRef.current === null) return;
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  };

  const releaseVideo = () => {
    const video = videoRef.current;
    if (!video?.hasAttribute('src')) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  };

  const schedulePreview = () => {
    if (suspended || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      onActivate();
    }, HOVER_PLAY_DELAY_MS);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!active || suspended || !video) {
      releaseVideo();
      return undefined;
    }
    video.src = contentUrl;
    video.load();
    void video.play().catch(() => undefined);
    return undefined;
  }, [active, contentUrl, suspended]);

  useEffect(() => {
    if (!suspended) return;
    clearHoverTimer();
    onDeactivate();
  }, [suspended]);

  useEffect(
    () => () => {
      clearHoverTimer();
      releaseVideo();
      onDeactivate();
    },
    [],
  );

  const stopPreview = () => {
    clearHoverTimer();
    onDeactivate();
    releaseVideo();
  };

  return (
    <>
      <video
        ref={videoRef}
        className={styles.tileVideo}
        poster={posterUrl ?? undefined}
        aria-label={`相册视频 ${index}`}
        muted
        loop
        playsInline
        preload="none"
        onMouseEnter={schedulePreview}
        onMouseLeave={stopPreview}
      />
      <span className={styles.videoBadge} aria-hidden="true">
        ▶
      </span>
    </>
  );
}
