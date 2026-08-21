import { useEffect } from 'react';
import styles from './DmAlbumPage.module.css';

interface AlbumVideoPreviewDialogProps {
  src: string;
  poster: string | null;
  onClose: () => void;
}

export function AlbumVideoPreviewDialog({ src, poster, onClose }: AlbumVideoPreviewDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.videoPreviewBackdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.videoPreviewDialog}
        role="dialog"
        aria-modal="true"
        aria-label="相册视频预览窗口"
        onClick={(event) => event.stopPropagation()}
      >
        <video
          className={styles.videoPreview}
          aria-label="相册视频预览"
          src={src}
          poster={poster ?? undefined}
          controls
          autoPlay
          playsInline
        />
        <button className={styles.videoPreviewClose} type="button" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}
