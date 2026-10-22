const PASSIVE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function isPassiveImageMimeType(mimeType: string): boolean {
  return PASSIVE_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}
