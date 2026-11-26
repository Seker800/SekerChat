export { DEFAULT_UPLOAD_PART_SIZE_BYTES as UPLOAD_PART_SIZE_BYTES } from '@sekerchat/shared';

/** S3 multipart allows at most 10,000 parts; reject anything outside 1..10000. */
export const MAX_UPLOAD_PARTS = 10_000;
