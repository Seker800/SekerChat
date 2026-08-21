import { BadRequestException } from '@nestjs/common';

export const DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_BYTES = 5n * 1024n * 1024n * 1024n;
export const MAX_SUBSCRIPTION_ATTACHMENTS = 5;

export function isSubscriptionManagerRole(role: string): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function assertSubscriptionAttachmentAllowed(options: {
  attachmentCount: number;
  sizeBytes: bigint;
  maxBytes: bigint;
}): void {
  if (options.sizeBytes < 1n) {
    throw new BadRequestException('文章附件不能为空。');
  }
  if (options.sizeBytes > options.maxBytes) {
    throw new BadRequestException(
      `文章附件过大，当前限制为 ${options.maxBytes / 1024n / 1024n}MB。`,
    );
  }
  if (options.attachmentCount >= MAX_SUBSCRIPTION_ATTACHMENTS) {
    throw new BadRequestException(`每篇文章最多上传 ${MAX_SUBSCRIPTION_ATTACHMENTS} 个附件。`);
  }
}

export function buildSubscriptionBodyPreview(body: string, maxLength = 180): string {
  const beforeFirstCodeBlock = body.split(/^```/m, 1)[0] ?? '';
  const plainText = beforeFirstCodeBlock
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plainText) {
    return '暂无正文';
  }
  const hasMore = body.trim().length > beforeFirstCodeBlock.trim().length
    || plainText.length > maxLength;
  const clipped = plainText.slice(0, maxLength).trim().replace(/[。.!！?？]+$/u, '');
  return hasMore ? `${clipped}…` : plainText;
}
