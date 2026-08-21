import { lazy, Suspense } from 'react';
import type { AvatarCropDialogProps } from './AvatarCropDialog';
import styles from './AvatarCropDialog.module.css';

const AvatarCropDialog = lazy(async () => ({
  default: (await import('./AvatarCropDialog')).AvatarCropDialog,
}));

function AvatarCropDialogFallback() {
  return (
    <div className={styles.backdrop} role="status" aria-live="polite" aria-label="头像裁剪弹窗加载中">
      <div className={styles.loadingPanel}>
        <span className={styles.loadingSpinner} aria-hidden="true" />
        <span className={styles.loadingText}>加载中...</span>
      </div>
    </div>
  );
}

export function LazyAvatarCropDialog(props: AvatarCropDialogProps) {
  return (
    <Suspense fallback={<AvatarCropDialogFallback />}>
      <AvatarCropDialog {...props} />
    </Suspense>
  );
}
