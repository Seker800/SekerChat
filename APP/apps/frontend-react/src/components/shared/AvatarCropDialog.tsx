import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import styles from './AvatarCropDialog.module.css';

export interface AvatarCropDialogProps {
  file: File;
  onSave(croppedBlob: Blob): void;
  onCancel(): void;
}

function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const size = Math.min(pixelCrop.width, pixelCrop.height, 512);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        size,
        size,
      );
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    };
    image.onerror = reject;
    image.src = imageSrc;
  });
}

export function AvatarCropDialog({ file, onSave, onCancel }: AvatarCropDialogProps) {
  const [imageSrc] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels || saving) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onSave(blob);
    } catch (error) {
      console.error('Avatar crop failed:', error);
      onCancel();
    } finally {
      setSaving(false);
    }
  }, [croppedAreaPixels, imageSrc, onSave, saving]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current) onCancel();
  };

  return (
    <div
      ref={dialogRef}
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-label="裁剪头像"
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>编辑头像</span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onCancel}
          >
            &times;
          </button>
        </div>
        <div className={styles.cropArea}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
