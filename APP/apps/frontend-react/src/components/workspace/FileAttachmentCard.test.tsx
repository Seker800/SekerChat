import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileAttachmentCard } from './FileAttachmentCard';

describe('FileAttachmentCard', () => {
  it('groups share and download into one compact, secondary action cluster', () => {
    const onShare = vi.fn();
    const onDownload = vi.fn();
    render(
      <FileAttachmentCard
        filename="release.zip"
        size={4096}
        onShare={onShare}
        onDownload={onDownload}
      />,
    );

    const actions = screen.getByRole('group', { name: '文件操作' });
    expect(actions).toHaveAttribute('data-layout', 'compact');
    expect(within(actions).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '分享',
      '下载',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '分享 release.zip' }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onDownload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '下载 release.zip' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('does not download when clicking file metadata or blank card area', () => {
    const onDownload = vi.fn();
    render(
      <FileAttachmentCard
        filename="release.zip"
        size={4096}
        onShare={() => undefined}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByTestId('file-attachment-card'));
    fireEvent.click(screen.getByText('release.zip'));
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('turns the share action blue and labels it 分享ing while the file is actively shared', () => {
    render(
      <FileAttachmentCard
        filename="release.zip"
        size={4096}
        isSharing
        onShare={() => undefined}
        onDownload={() => undefined}
      />,
    );

    const shareAction = screen.getByRole('button', { name: '管理分享 release.zip' });
    expect(shareAction).toHaveTextContent('分享ing');
    expect(shareAction).toHaveAttribute('data-sharing', 'true');
  });

  it('hides share when the current user cannot manage the file', () => {
    render(
      <FileAttachmentCard
        filename="release.zip"
        size={4096}
        canShare={false}
        onShare={() => undefined}
        onDownload={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '分享 release.zip' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载 release.zip' })).toBeVisible();
  });
});
