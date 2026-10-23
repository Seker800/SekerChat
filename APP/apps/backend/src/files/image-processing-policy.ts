import sharp from 'sharp';

// Each source is processed once and its thumbnail is persisted in object storage.
// The operation cache otherwise retains native JPEG decoder allocations, which
// are not covered by libvips' tracked-memory cache limit (notably progressive JPEG).
sharp.cache(false);

// Large artwork is supported. Native work is serialized and streamed through disk
// by withStoredImage; pixel count must not redefine whether an upload succeeded.
export function createImageProcessor(input?: Buffer | string) {
  const options = {
    limitInputPixels: false as const,
    sequentialRead: true,
    failOn: 'warning' as const,
  };
  return input ? sharp(input, options) : sharp(options);
}
