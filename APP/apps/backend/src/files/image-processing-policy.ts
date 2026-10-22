import sharp from 'sharp';

export const MAX_IMAGE_METADATA_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_INPUT_PIXELS = 40_000_000;

export function createImageProcessor(input?: Buffer | string) {
  return input
    ? sharp(input, { limitInputPixels: MAX_IMAGE_INPUT_PIXELS, failOn: 'warning' })
    : sharp({ limitInputPixels: MAX_IMAGE_INPUT_PIXELS, failOn: 'warning' });
}
