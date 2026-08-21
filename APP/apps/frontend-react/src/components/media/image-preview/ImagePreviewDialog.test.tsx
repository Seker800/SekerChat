import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ImagePreviewDialog } from './ImagePreviewDialog';

function renderDialog(overrides: Partial<Parameters<typeof ImagePreviewDialog>[0]> = {}) {
  const onImageLoad = vi.fn();
  const props: Parameters<typeof ImagePreviewDialog>[0] = {
    activeDimensions: null,
    canPan: false,
    fitScale: 1,
    image: { src: '/api/files/file-1/content', alt: '灵感图.png' },
    offset: { x: 0, y: 0 },
    scale: 1,
    stageRef: createRef<HTMLDivElement>(),
    onClose: vi.fn(),
    onImageLoad,
    onImagePointerDown: vi.fn(),
    onWheel: vi.fn(),
    ...overrides,
  };

  return { ...render(<ImagePreviewDialog {...props} />), onImageLoad };
}

describe('shared ImagePreviewDialog', () => {
  it('keeps loading, retry and source-change behavior independent from workspace UI', () => {
    const { onImageLoad, rerender } = renderDialog();
    const firstImage = screen.getByTestId('image-preview-image');
    expect(screen.getByRole('status')).toHaveTextContent('正在加载大图…');

    fireEvent.error(firstImage);
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(screen.getByTestId('image-preview-image')).not.toBe(firstImage);

    fireEvent.load(screen.getByTestId('image-preview-image'));
    expect(onImageLoad).toHaveBeenCalledTimes(1);

    rerender(
      <ImagePreviewDialog
        activeDimensions={null}
        canPan={false}
        fitScale={1}
        image={{ src: '/api/files/file-2/content', alt: '第二张.png' }}
        offset={{ x: 0, y: 0 }}
        scale={1}
        stageRef={createRef<HTMLDivElement>()}
        onClose={vi.fn()}
        onImageLoad={vi.fn()}
        onImagePointerDown={vi.fn()}
        onWheel={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('正在加载大图…');
  });
});
