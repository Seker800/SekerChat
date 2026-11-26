import sharp from 'sharp';

// Each source is processed once and its thumbnail is persisted in object storage.
// The operation cache otherwise retains native JPEG decoder allocations, which
// are not covered by libvips' tracked-memory cache limit (notably progressive JPEG).
sharp.cache(false);

// Hard backstop for absurd headers. The decoded-byte budget below is the real
// limit; this only protects code paths that decode without checking first. It
// stays just above the documented 94 MP artwork case.
export const IMAGE_MAX_INPUT_PIXELS = 100_000_000;

// Native decoders can allocate far more than their tracked memory. Keep the
// decoded-image estimate below the 1 GiB backend container limit.
export const IMAGE_MAX_DECODED_BYTES = 600 * 1024 * 1024;

export interface ImageMetadataLike {
  width?: number;
  height?: number;
  channels?: number;
  depth?: string;
}

export class ImageDecodeBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageDecodeBudgetExceededError';
  }
}

export function estimateDecodedBytes(metadata: ImageMetadataLike): number {
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const channels = metadata.channels && metadata.channels > 0 ? metadata.channels : 4;
  const bytesPerChannel =
    metadata.depth === 'ushort' ? 2 : metadata.depth === 'float' ? 4 : 1;
  return width * height * channels * bytesPerChannel;
}

/**
 * Reject only the native decode step. Uploads, downloads, and shares keep
 * working for oversized images; they simply fall back to the original content
 * instead of a generated thumbnail.
 */
export function assertWithinImageDecodeBudget(metadata: ImageMetadataLike): void {
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const pixels = width * height;
  if (pixels <= 0) return;

  if (pixels > IMAGE_MAX_INPUT_PIXELS) {
    throw new ImageDecodeBudgetExceededError(
      `Image dimensions ${width}x${height} exceed the ${IMAGE_MAX_INPUT_PIXELS} pixel limit.`,
    );
  }

  const decodedBytes = estimateDecodedBytes(metadata);
  if (decodedBytes > IMAGE_MAX_DECODED_BYTES) {
    throw new ImageDecodeBudgetExceededError(
      `Image decode estimate ${decodedBytes} bytes exceeds the ${IMAGE_MAX_DECODED_BYTES} byte budget.`,
    );
  }
}

/**
 * Header-only read: never decodes pixels, so it is safe to call before the
 * budget check even for absurd dimensions. Do not use the returned instance to
 * produce output.
 */
export function readImageHeaderMetadata(input: Buffer | string) {
  return sharp(input, { limitInputPixels: false, sequentialRead: true }).metadata();
}

export function createImageProcessor(input?: Buffer | string) {
  const options = {
    limitInputPixels: IMAGE_MAX_INPUT_PIXELS,
    sequentialRead: true,
    failOn: 'warning' as const,
  };
  return input ? sharp(input, options) : sharp(options);
}
