const MAX_MESSAGE_IMAGE_WIDTH_PX = 420;
const MAX_MESSAGE_IMAGE_HEIGHT_PX = 320;
const FALLBACK_MESSAGE_IMAGE_WIDTH_PX = 320;
const FALLBACK_MESSAGE_IMAGE_HEIGHT_PX = 160;

export interface MessageImageShellLayout {
  widthPx: number;
  heightPx: number;
  aspectRatio: string;
}

function isPositiveDimension(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getMessageImageShellLayout(
  imageWidth?: number | null,
  imageHeight?: number | null,
): MessageImageShellLayout {
  if (!isPositiveDimension(imageWidth) || !isPositiveDimension(imageHeight)) {
    return {
      widthPx: FALLBACK_MESSAGE_IMAGE_WIDTH_PX,
      heightPx: FALLBACK_MESSAGE_IMAGE_HEIGHT_PX,
      aspectRatio: `${FALLBACK_MESSAGE_IMAGE_WIDTH_PX} / ${FALLBACK_MESSAGE_IMAGE_HEIGHT_PX}`,
    };
  }

  const scale = Math.min(
    MAX_MESSAGE_IMAGE_WIDTH_PX / imageWidth,
    MAX_MESSAGE_IMAGE_HEIGHT_PX / imageHeight,
    1,
  );

  const widthPx = Math.max(Math.round(imageWidth * scale), 1);
  const heightPx = Math.max(Math.round(imageHeight * scale), 1);

  return {
    widthPx,
    heightPx,
    aspectRatio: `${widthPx} / ${heightPx}`,
  };
}
