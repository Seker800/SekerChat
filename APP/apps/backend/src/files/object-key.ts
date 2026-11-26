// Object keys are literal strings in S3/MinIO, but path separators and `..`
// must never survive into a key because a proxy or a future storage backend may
// normalize them. Keep spaces, parentheses, and unicode so existing artifact and
// attachment names remain recognizable.
// eslint-disable-next-line no-control-regex -- control characters must never enter an object key
const UNSAFE_OBJECT_KEY_CHARS = /[/\\\u0000-\u001f\u007f:*?"<>|]+/g;

/**
 * Normalize one path segment for an object-storage key. Display names stay in
 * the database; only the key is constrained.
 */
export function sanitizeObjectKeySegment(value: string, fallback = 'file'): string {
  const sanitized = value
    .trim()
    .replace(UNSAFE_OBJECT_KEY_CHARS, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .trim();
  return sanitized || fallback;
}
