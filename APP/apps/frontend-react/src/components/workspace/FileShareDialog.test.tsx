import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileShareDialog } from './FileShareDialog';

describe('FileShareDialog', () => {
  it('uses one accessible switch for the share state and keeps utility actions as icon controls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <FileShareDialog
        filename="release.zip"
        initialShare={{
          exists: true,
          url: 'http://chat.test/s#t=opaque-token',
          password: 'aB3x',
          expiresAt: '2026-08-13T10:00:00.000Z',
          status: 'ACTIVE',
          downloadCount: 2,
          lastDownloadedAt: null,
          activatedBy: {
            id: 'user-7',
            email: 'operator@example.com',
            displayName: '小林',
            avatarUrl: null,
          },
        }}
        onClose={() => undefined}
        onSave={vi.fn()}
        onRevoke={vi.fn()}
        onRotateLink={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: '文件分享' })).toBeVisible();
    const titlebar = screen.getByRole('banner');
    expect(within(titlebar).getByText('release.zip')).toBeVisible();
    expect(within(titlebar).getByText('分享中')).toBeVisible();
    expect(within(titlebar).getByText('下载 2 次')).toBeVisible();
    expect(within(titlebar).getByText('小林')).toBeVisible();
    expect(within(titlebar).queryByText('分享文件')).not.toBeInTheDocument();
    expect(screen.getByText('小林')).toBeVisible();
    expect(screen.getAllByText('小林')).toHaveLength(1);
    expect(screen.queryByText('激活了此分享')).not.toBeInTheDocument();
    const textButtons = screen
      .getAllByRole('button')
      .filter((button) => button.textContent?.trim());
    expect(textButtons).toHaveLength(0);

    const copyButton = screen.getByRole('button', { name: '复制分享信息' });
    expect(copyButton).toHaveTextContent('');
    expect(screen.getByRole('button', { name: '更新链接和密码' })).toHaveTextContent('');
    expect(screen.getByRole('button', { name: '重新生成密码' })).toHaveTextContent('');
    expect(screen.getByRole('switch', { name: '分享链接' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('分享已开启')).toBeVisible();
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('下载地址：http://chat.test/s#t=opaque-token');
    expect(writeText.mock.calls[0][0]).toContain('密码：aB3x');
  });

  it('closes and reopens sharing through the same switch', async () => {
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const activeShare = {
      exists: true,
      url: 'http://chat.test/s#t=stable-token',
      password: 'aB3x',
      expiresAt: '2026-08-13T10:00:00.000Z',
      status: 'ACTIVE' as const,
      downloadCount: 0,
      lastDownloadedAt: null,
      activatedBy: null,
    };
    const { rerender } = render(
      <FileShareDialog
        filename="release.zip"
        initialShare={activeShare}
        onClose={() => undefined}
        onSave={onSave}
        onRevoke={onRevoke}
        onRotateLink={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: '分享链接' }));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));

    rerender(
      <FileShareDialog
        filename="release.zip"
        initialShare={{ ...activeShare, status: 'REVOKED' }}
        onClose={() => undefined}
        onSave={onSave}
        onRevoke={onRevoke}
        onRotateLink={vi.fn()}
      />,
    );

    const switchControl = screen.getByRole('switch', { name: '分享链接' });
    expect(switchControl).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('分享已关闭')).toBeVisible();
    fireEvent.click(switchControl);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('upgrades a legacy password when share settings are modified without rotating the link', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const futureExpiresAt = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
    render(
      <FileShareDialog
        filename="release.zip"
        initialShare={{
          exists: true,
          url: 'http://chat.test/s#t=stable-token',
          password: 'aB3x',
          expiresAt: '2026-08-13T10:00:00.000Z',
          status: 'ACTIVE',
          downloadCount: 0,
          lastDownloadedAt: null,
          activatedBy: null,
        }}
        onClose={() => undefined}
        onSave={onSave}
        onRevoke={vi.fn()}
        onRotateLink={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '保存设置' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('分享密码'), { target: { value: 'Zx8q' } });
    fireEvent.change(screen.getByLabelText('有效期至'), { target: { value: futureExpiresAt } });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.password).not.toBe('Zx8q');
    expect(saved.password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{16}$/);
    expect(saved.expiresAt).toBe(new Date(futureExpiresAt).toISOString());
    expect(screen.getByDisplayValue('http://chat.test/s#t=stable-token')).toBeVisible();
  });

  it('falls back to a legacy copy path on HTTP and reports copy success', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    render(
      <FileShareDialog
        filename="release.zip"
        initialShare={{
          exists: true,
          url: 'http://chat.test/s#t=token',
          password: 'aB3x',
          expiresAt: '2026-08-13T10:00:00.000Z',
          status: 'ACTIVE',
          downloadCount: 0,
          lastDownloadedAt: null,
          activatedBy: null,
        }}
        onClose={() => undefined}
        onSave={vi.fn()}
        onRevoke={vi.fn()}
        onRotateLink={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '复制分享信息' }));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('已复制');
    expect(notice.closest('[aria-label="分享状态"]')).not.toBeNull();
  });

  it('validates input and renders asynchronous action errors inside the dialog', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('保存失败'));
    render(
      <FileShareDialog
        filename="release.zip"
        initialShare={{
          exists: true,
          url: 'http://chat.test/s#t=token',
          password: 'aB3x',
          expiresAt: '2099-08-13T10:00:00.000Z',
          status: 'ACTIVE',
          downloadCount: 0,
          lastDownloadedAt: null,
          activatedBy: null,
        }}
        onClose={() => undefined}
        onSave={onSave}
        onRevoke={vi.fn()}
        onRotateLink={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('分享密码'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '密码需为 12 至 64 位字母和数字，并同时包含大小写字母和数字',
    );
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('分享密码'), { target: { value: 'Zx8q' } });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败');
  });

  it('can generate another high-entropy password without changing the link', () => {
    render(
      <FileShareDialog
        filename="release.zip"
        initialShare={{
          exists: true,
          url: 'http://chat.test/s#t=stable',
          password: 'aB3x',
          expiresAt: '2026-08-13T10:00:00.000Z',
          status: 'ACTIVE',
          downloadCount: 0,
          lastDownloadedAt: null,
          activatedBy: null,
        }}
        onClose={() => undefined}
        onSave={vi.fn()}
        onRevoke={vi.fn()}
        onRotateLink={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '重新生成密码' }));
    expect((screen.getByLabelText('分享密码') as HTMLInputElement).value).toMatch(
      /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{16}$/,
    );
    expect(screen.getByDisplayValue('http://chat.test/s#t=stable')).toBeVisible();
  });

  it('refreshes the public link and password together', async () => {
    const onRotateLink = vi.fn().mockResolvedValue(undefined);
    render(
      <FileShareDialog
        filename="release.zip"
        initialShare={{
          exists: true,
          url: 'http://chat.test/s#t=stable',
          password: 'aB3x',
          expiresAt: '2026-08-13T10:00:00.000Z',
          status: 'ACTIVE',
          downloadCount: 0,
          lastDownloadedAt: null,
          activatedBy: null,
        }}
        onClose={() => undefined}
        onSave={vi.fn()}
        onRevoke={vi.fn()}
        onRotateLink={onRotateLink}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '更新链接和密码' }));

    await waitFor(() => expect(onRotateLink).toHaveBeenCalledTimes(1));
    const nextPassword = onRotateLink.mock.calls[0][0].password as string;
    expect(nextPassword).not.toBe('aB3x');
    expect(nextPassword).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{16}$/);
    expect(screen.getByLabelText('分享密码')).toHaveValue(nextPassword);
    expect(screen.getByRole('status')).toHaveTextContent('链接和密码已更新');
  });

  it.each([
    ['DRAFT', false, '尚未创建'],
    ['REVOKED', true, '已关闭'],
    ['EXPIRED', true, '已过期'],
  ] as const)(
    'hides stale credentials for %s and exposes the inactive share switch',
    async (status, exists, statusLabel) => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(
        <FileShareDialog
          filename="release.zip"
          initialShare={{
            exists,
            url: 'http://chat.test/s#t=stale-token',
            password: 'aB3x',
            expiresAt: '2020-08-13T10:00:00.000Z',
            status,
            downloadCount: 2,
            lastDownloadedAt: null,
            activatedBy: {
              id: 'user-7',
              email: 'operator@example.com',
              displayName: '小林',
              avatarUrl: null,
            },
          }}
          onClose={() => undefined}
          onSave={onSave}
          onRevoke={vi.fn()}
          onRotateLink={vi.fn()}
        />,
      );

      expect(screen.getByText('release.zip')).toBeVisible();
      expect(screen.getByText(statusLabel)).toBeVisible();
      expect(screen.queryByRole('textbox', { name: '分享链接' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('分享密码')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('有效期至')).not.toBeInTheDocument();
      expect(screen.queryByText('小林')).not.toBeInTheDocument();
      expect(screen.queryByText('下载 2 次')).not.toBeInTheDocument();

      const switchControl = screen.getByRole('switch', { name: '分享链接' });
      expect(switchControl).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(switchControl);
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const input = onSave.mock.calls[0][0] as { password: string; expiresAt: string };
      expect(input.password).not.toBe('aB3x');
      expect(input.password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{16}$/);
      expect(new Date(input.expiresAt).getTime()).toBeGreaterThan(Date.now());
    },
  );

  it('shows archived state without credentials or an activation action', () => {
    render(
      <FileShareDialog
        filename="release.zip"
        initialShare={{
          exists: true,
          url: 'http://chat.test/s#t=stale-token',
          password: 'aB3x',
          expiresAt: '2026-08-13T10:00:00.000Z',
          status: 'CHANNEL_ARCHIVED',
          downloadCount: 2,
          lastDownloadedAt: null,
          activatedBy: null,
        }}
        onClose={() => undefined}
        onSave={vi.fn()}
        onRevoke={vi.fn()}
        onRotateLink={vi.fn()}
      />,
    );

    expect(screen.getByText('频道已归档')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '分享链接' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '分享链接' })).toBeDisabled();
  });
});
