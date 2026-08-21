import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicFileSharePage } from './PublicFileSharePage';

describe('PublicFileSharePage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('verifies the password and starts the download immediately without a second screen', async () => {
    window.history.replaceState(null, '', '/s#t=opaque-public-token');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          shareId: 'share-1',
          fileName: 'release.zip',
          mimeType: 'application/zip',
          size: '4096',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    let clickedHref = '';
    let clickedDownload = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      clickedHref = this.href;
      clickedDownload = this.download;
    });

    render(<PublicFileSharePage />);
    fireEvent.change(screen.getByLabelText('分享密码'), { target: { value: 'aB3x' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并下载' }));

    await waitFor(() => expect(clickedDownload).toBe('release.zip'));
    expect(clickedHref).toContain('/api/public/file-shares/share-1/content');
    expect(window.location.hash).toBe('');
    expect(screen.queryByRole('button', { name: '下载文件' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('下载已开始');
    expect(screen.getByLabelText('文件分享下载')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the token fragment available until unlock succeeds', async () => {
    window.history.replaceState(null, '', '/s?source=chat#t=opaque-public-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: '分享链接不可用或密码错误。' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    render(<PublicFileSharePage />);
    fireEvent.change(screen.getByLabelText('分享密码'), { target: { value: 'aB3x' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并下载' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('分享链接不可用或密码错误。');
    expect(window.location.pathname).toBe('/s');
    expect(window.location.search).toBe('?source=chat');
    expect(window.location.hash).toBe('#t=opaque-public-token');
  });

  it('accepts both legacy four-character and current long share passwords', () => {
    window.history.replaceState(null, '', '/s#t=opaque-public-token');
    vi.stubGlobal('fetch', vi.fn());

    const { rerender } = render(<PublicFileSharePage />);
    const input = screen.getByLabelText('分享密码');
    const submit = screen.getByRole('button', { name: '验证并下载' });

    fireEvent.change(input, { target: { value: 'aB3x' } });
    expect(submit).toBeEnabled();

    fireEvent.change(input, { target: { value: 'CorrectHorse7' } });
    rerender(<PublicFileSharePage />);
    expect(submit).toBeEnabled();
  });
});
