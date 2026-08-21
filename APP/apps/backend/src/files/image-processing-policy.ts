import sharp from 'sharp';

export const MAX_IMAGE_INPUT_PIXELS = 40_000_000;

export function createImageProcessor(input?: Buffer) {
  return input
    ? sharp(input, { limitInputPixels: MAX_IMAGE_INPUT_PIXELS, failOn: 'warning' })
    : sharp({ limitInputPixels: MAX_IMAGE_INPUT_PIXELS, failOn: 'warning' });
}
