import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { ObjectStorageGateway } from './object-storage.gateway';

type TestableGateway = {
  internalClient: { send: (command: unknown) => Promise<unknown> };
};

function createGateway(send: (command: unknown) => Promise<unknown>): ObjectStorageGateway {
  const gateway = new ObjectStorageGateway(
    new ConfigService({
      S3_BUCKET: 'test-bucket',
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
    }),
  );
  (gateway as unknown as TestableGateway).internalClient = { send };
  return gateway;
}

test('gateway retries one transient GetObject failure and returns the object', async () => {
  let attempts = 0;
  const gateway = createGateway(async () => {
    attempts += 1;
    if (attempts === 1) throw { name: 'UnknownError' };
    return {
      Body: Readable.from(Buffer.from('thumbnail')),
      ContentType: 'image/webp',
      ContentLength: 9,
    };
  });

  const object = await gateway.get('private/thumbnail.webp');

  assert.equal(attempts, 2);
  assert.equal(object.mimeType, 'image/webp');
  assert.equal(object.contentLength, 9);
});

test('gateway returns 503 after transient GetObject retry is exhausted', async () => {
  let attempts = 0;
  const gateway = createGateway(async () => {
    attempts += 1;
    throw { name: 'UnknownError' };
  });

  await assert.rejects(gateway.get('private/thumbnail.webp'), (error) => {
    assert.equal(error instanceof ServiceUnavailableException, true);
    assert.equal((error as ServiceUnavailableException).getStatus(), 503);
    return true;
  });
  assert.equal(attempts, 2);
});

test('gateway preserves non-retryable GetObject errors without another request', async () => {
  const notFound = { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } };
  let attempts = 0;
  const gateway = createGateway(async () => {
    attempts += 1;
    throw notFound;
  });

  await assert.rejects(
    gateway.get('private/missing.webp'),
    (error) => error === notFound,
  );
  assert.equal(attempts, 1);
});
