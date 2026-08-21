import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionMarkdown } from './SubscriptionMarkdown';

const getSubscriptionAttachmentViewUrl = vi.fn();

vi.mock('../../lib/subscriptions-api', () => ({
  getSubscriptionAttachmentViewUrl: (...args: unknown[]) =>
    getSubscriptionAttachmentViewUrl(...args),
}));

describe('SubscriptionMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders common markdown while escaping raw HTML and blocking dangerous links', () => {
    const { container } = render(
      <SubscriptionMarkdown
        accessToken="token"
        body={'## 标题\n\n- 条目\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))'}
        attachments={[]}
      />,
    );

    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument();
    expect(screen.getByText('条目')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });

  it('resolves only image attachments belonging to the current post', async () => {
    getSubscriptionAttachmentViewUrl.mockResolvedValueOnce({
      url: 'https://objects.example/image.png',
      originalName: 'image.png',
      mimeType: 'image/png',
      size: 1024,
    });

    const { container } = render(
      <SubscriptionMarkdown
        accessToken="token"
        body={'![正文图片](attachment://image-1)\n\n![越权图片](attachment://other-post-image)'}
        attachments={[
          {
            id: 'image-1',
            originalName: 'image.png',
            mimeType: 'image/png',
            size: 1024,
            sha256: 'abc',
            downloadCount: 0,
            usage: 'INLINE_IMAGE',
          },
        ]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('img', { name: '正文图片' })).toHaveAttribute(
        'src',
        'https://objects.example/image.png',
      ),
    );
    expect(getSubscriptionAttachmentViewUrl).toHaveBeenCalledWith('token', 'image-1');
    expect(getSubscriptionAttachmentViewUrl).not.toHaveBeenCalledWith(
      'token',
      'other-post-image',
    );
    expect(container.textContent).toContain('图片不可用');
  });

  it('does not load remote markdown images', () => {
    const { container } = render(
      <SubscriptionMarkdown
        accessToken="token"
        body="![远程追踪图](https://tracker.example/pixel.gif)"
        attachments={[]}
      />,
    );

    expect(container.querySelector('img[src^="https://tracker.example"]')).toBeNull();
    expect(container.textContent).toContain('外部图片已隐藏');
  });
});
