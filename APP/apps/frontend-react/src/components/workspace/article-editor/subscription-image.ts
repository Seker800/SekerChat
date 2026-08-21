const ATTACHMENT_URL = /^attachment:\/\/([a-zA-Z0-9_-]+)$/u;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

export function getSubscriptionAttachmentId(url: string): string | null {
  return ATTACHMENT_URL.exec(url)?.[1] ?? null;
}

export function normalizePastedImageFile(file: File, timestamp = Date.now()): File {
  if (!/^image(?:\.[a-z0-9]+)?$/iu.test(file.name)) return file;
  const extension = IMAGE_EXTENSIONS[file.type] ?? 'png';
  return new File([file], `粘贴图片-${timestamp}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}
