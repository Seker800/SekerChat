import { useEffect, useMemo, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import {
  getSubscriptionAttachmentViewUrl,
  type SubscriptionAttachment,
} from '../../lib/subscriptions-api';
import styles from './DmSubscriptionPage.module.css';

interface SubscriptionMarkdownProps {
  accessToken: string;
  body: string;
  attachments: SubscriptionAttachment[];
}

function createSubscriptionMarkdown(attachments: SubscriptionAttachment[]) {
  const allowedImages = new Set(
    attachments
      .filter((attachment) => attachment.mimeType.startsWith('image/'))
      .map((attachment) => attachment.id),
  );
  const markdown = new MarkdownIt({
    breaks: true,
    html: false,
    linkify: true,
    typographer: false,
  });
  markdown.disable(['html_block', 'html_inline']);

  const defaultLinkOpen = markdown.renderer.rules.link_open
    ?? ((tokens: any, index: any, options: any, _env: any, self: any) =>
      self.renderToken(tokens, index, options));
  markdown.renderer.rules.link_open = (
    tokens: any,
    index: any,
    options: any,
    env: any,
    self: any,
  ) => {
    const token = tokens[index];
    if (!token) return defaultLinkOpen(tokens, index, options, env, self);
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noreferrer noopener');
    return defaultLinkOpen(tokens, index, options, env, self);
  };

  markdown.renderer.rules.image = (tokens: any, index: any) => {
    const token = tokens[index];
    const source = token?.attrGet('src') ?? '';
    const alt = markdown.utils.escapeHtml(token?.content || '图片');
    if (!source.startsWith('attachment://')) {
      return `<span class="${styles.markdownImageUnavailable}">外部图片已隐藏：${alt}</span>`;
    }
    const attachmentId = source.slice('attachment://'.length);
    if (!allowedImages.has(attachmentId)) {
      return `<span class="${styles.markdownImageUnavailable}">图片不可用：${alt}</span>`;
    }
    return `<img alt="${alt}" data-subscription-attachment-id="${markdown.utils.escapeHtml(attachmentId)}">`;
  };

  return markdown;
}

export function SubscriptionMarkdown({
  accessToken,
  body,
  attachments,
}: SubscriptionMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markdown = useMemo(() => createSubscriptionMarkdown(attachments), [attachments]);
  const renderedHtml = useMemo(() => markdown.render(body), [body, markdown]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new AbortController();
    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>('img[data-subscription-attachment-id]'),
    );
    images.forEach((image) => {
      const attachmentId = image.dataset.subscriptionAttachmentId;
      if (!attachmentId) return;
      void getSubscriptionAttachmentViewUrl(accessToken, attachmentId)
        .then((result) => {
          if (!controller.signal.aborted) {
            image.src = result.url;
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            image.replaceWith(document.createTextNode(`图片加载失败：${image.alt}`));
          }
        });
    });
    return () => controller.abort();
  }, [accessToken, renderedHtml]);

  return (
    <div
      ref={containerRef}
      className={styles.markdownBody}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
