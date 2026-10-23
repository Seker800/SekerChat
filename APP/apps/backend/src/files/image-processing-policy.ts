import sharp from 'sharp';

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
