import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { FilesService } from './files.service';
import { FileAccessService } from './file-access.service';
import { FileUrlService } from './file-url.service';
import { ImageMetadataService } from './image-metadata.service';

const fileRecord = {
  id: 'file-1',
  groupId: 'group-1',
  storageKey: 'group-1/original/evidence.png',
  thumbnailStorageKey: 'group-1/thumb/evidence.jpg',
  thumbnailSize: 128,
  imageWidth: 1600,
  imageHeight: 900,
  originalName: 'evidence.png',
  mimeType: 'image/png',
  size: 4096n,
  uploaderId: 'user-1',
  createdAt: new Date('2026-08-10T08:00:00.000Z'),
};

function createFilesService() {
  const prisma = {
    user: { findUnique: async () => ({ role: 'MEMBER' }) },
    group: { findFirst: async () => ({ id: 'group-1' }) },
    fileObject: { findFirst: async () => fileRecord },
  };
  const values: Record<string, unknown> = {
    S3_BUCKET: 'sekerchat-test',
    API_BASE_URL: 'http://localhost:3100',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_ENDPOINT: 'http://localhost:9000',
  };
  const config = {
    getOrThrow: <T>(key: string) => values[key] as T,
    get: <T>(key: string) => values[key] as T | undefined,
  };
  const objectStorage = {
    get: async () => ({
      mimeType: 'image/jpeg',
      stream: Readable.from(['thumbnail']),
      contentLength: 128,
      etag: '"thumb-etag"',
    }),
  };
  return new FilesService(
    prisma as never,
    objectStorage as never,
    new FileAccessService(prisma as never),
    new ImageMetadataService(prisma as never, objectStorage as never),
    new FileUrlService(config as never),
  );
}

test('getThumbnailStream reads the thumbnail object key and forwards the validator', async () => {
  const service = createFilesService();
  let requestedKey = '';
  let requestedValidator: string | undefined;
  (service as any).objectStorage.get = async (key: string, options: { ifNoneMatch?: string }) => {
    requestedKey = key;
    requestedValidator = options.ifNoneMatch;
    return {
      mimeType: 'image/jpeg',
      stream: Readable.from(['thumbnail']),
      contentLength: 128,
      etag: '"thumb-etag"',
    };
  };

  const result = await service.getThumbnailStream('user-1', 'group-1', 'file-1', '"previous-etag"');

  assert.equal(requestedKey, fileRecord.thumbnailStorageKey);
  assert.equal(requestedValidator, '"previous-etag"');
  assert.ok('stream' in result);
  assert.equal('contentLength' in result ? result.contentLength : undefined, 128);
});
