import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RangeNotSatisfiableException } from '../common/range-parser';
import { FilesController } from './files.controller';

function createResponseDouble() {
  const headers = new Map<string, string>();
  const response = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    vary(field: string) {
      const existing = headers.get('Vary');
      headers.set('Vary', existing ? `${existing}, ${field}` : field);
    },
  };

  return { headers, response };
}

test('getFileContent returns 416 when object storage rejects an unsatisfiable range', async () => {
  const filesService = {
    getFileStream: async () => {
      throw new RangeNotSatisfiableException(1024);
    },
  };
  const controller = new FilesController(filesService as never);
  const responseDouble = createResponseDouble();

  const result = await controller.getFileContent(
    { sub: 'user-1' } as never,
    'group-1',
    'file-1',
    'bytes=2048-',
    responseDouble.response as never,
  );

  assert.equal(result, undefined);
  assert.equal(responseDouble.response.statusCode, 416);
  assert.equal(responseDouble.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(responseDouble.headers.get('Content-Range'), 'bytes */1024');
});

test('getFileThumbnail exposes private validators and authorization cache partitioning', async () => {
  const lastModified = new Date('2026-08-10T08:00:00.000Z');
  const filesService = {
    getThumbnailStream: async () => ({
      file: { thumbnailStorageKey: 'thumb/file-1.jpg', mimeType: 'image/png' },
      stream: {} as never,
      etag: '"thumb-etag"',
      lastModified,
      contentLength: 128,
    }),
  };
  const controller = new FilesController(filesService as never);
  const responseDouble = createResponseDouble();
  responseDouble.response.setHeader('Vary', 'Origin');

  await controller.getFileThumbnail(
    { sub: 'user-1' } as never,
    'group-1',
    'file-1',
    undefined,
    responseDouble.response as never,
  );

  assert.equal(responseDouble.headers.get('Cache-Control'), 'private, max-age=3600');
  assert.equal(responseDouble.headers.get('Vary'), 'Origin, Authorization');
  assert.equal(responseDouble.headers.get('ETag'), '"thumb-etag"');
  assert.equal(responseDouble.headers.get('Last-Modified'), lastModified.toUTCString());
  assert.equal(responseDouble.headers.get('Content-Length'), '128');
});

test('getFileThumbnail returns 304 without a response body when the thumbnail is unchanged', async () => {
  const filesService = {
    getThumbnailStream: async (_userId: string, _groupId: string, _fileId: string, ifNoneMatch?: string) => {
      assert.equal(ifNoneMatch, '"thumb-etag"');
      return {
        file: { thumbnailStorageKey: 'thumb/file-1.jpg', mimeType: 'image/png' },
        notModified: true,
        etag: '"thumb-etag"',
      };
    },
  };
  const controller = new FilesController(filesService as never);
  const responseDouble = createResponseDouble();

  const result = await controller.getFileThumbnail(
    { sub: 'user-1' } as never,
    'group-1',
    'file-1',
    '"thumb-etag"',
    responseDouble.response as never,
  );

  assert.equal(result, undefined);
  assert.equal(responseDouble.response.statusCode, 304);
});

test('getFileViewUrl exposes the presigned URL expiry', async () => {
  const expiresAt = '2026-08-10T09:00:00.000Z';
  const filesService = {
    createFileViewUrl: async () => ({
      file: { mimeType: 'image/png', size: 1024n },
      url: 'https://media.example/original.png',
      expiresAt,
    }),
  };
  const controller = new FilesController(filesService as never);

  const result = await controller.getFileViewUrl(
    { sub: 'user-1' } as never,
    'group-1',
    'file-1',
  );

  assert.deepEqual(result, {
    url: 'https://media.example/original.png',
    mimeType: 'image/png',
    size: 1024,
    expiresAt,
  });
});
