import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LazyAvatarCropDialog } from './LazyAvatarCropDialog';

vi.mock('./AvatarCropDialog', () => ({
  AvatarCropDialog: vi.fn(() => null),
}));

describe('LazyAvatarCropDialog', () => {
  it('shows a lightweight loading overlay while the crop dialog chunk is loading', async () => {
    render(
      <LazyAvatarCropDialog
        file={new File(['avatar'], 'avatar.png', { type: 'image/png' })}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByLabelText('头像裁剪弹窗加载中')).toBeInTheDocument();
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
