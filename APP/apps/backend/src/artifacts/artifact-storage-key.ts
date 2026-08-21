const ARTIFACT_STORAGE_PREFIX = 's3:';

export function serializeArtifactStorageKey(storageKey: string): string {
  return `${ARTIFACT_STORAGE_PREFIX}${storageKey}`;
}

export function extractArtifactStorageKey(relativePath: string): string {
  if (!relativePath.startsWith(ARTIFACT_STORAGE_PREFIX)) {
    throw new Error('Artifact relative path is not backed by object storage.');
  }
  return relativePath.slice(ARTIFACT_STORAGE_PREFIX.length);
}
