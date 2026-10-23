import type { Prisma } from '@prisma/client';

export interface ClaimedFilePreviewJob {
  fileId: string;
  attempts: number;
  leaseVersion: number;
}

export const filePreviewJobSelect = {
  status: true,
  attempts: true,
  lastError: true,
} satisfies Prisma.FilePreviewJobSelect;

export function previewJobForImage(mimeType: string) {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType.toLowerCase())
    ? { create: {} }
    : undefined;
}

export function previewStatus(
  job?: { status: string; attempts: number } | null,
  thumbnailKey?: string | null,
) {
  if (thumbnailKey) return 'READY';
  return job?.status ?? 'UNAVAILABLE';
}
