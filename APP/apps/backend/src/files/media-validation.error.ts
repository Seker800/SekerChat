import { BadRequestException } from '@nestjs/common';

export type PermanentMediaValidationCode =
  | 'IMAGE_PIXEL_LIMIT_EXCEEDED'
  | 'IMAGE_CONTENT_MISMATCH'
  | 'IMAGE_DECODE_FAILED';

export class PermanentMediaValidationError extends BadRequestException {
  constructor(
    readonly code: PermanentMediaValidationCode,
    message: string,
  ) {
    super({ code, message });
    this.name = PermanentMediaValidationError.name;
  }
}

export function describeMediaProcessingError(error: unknown): string {
  if (error instanceof PermanentMediaValidationError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unknown';
}
