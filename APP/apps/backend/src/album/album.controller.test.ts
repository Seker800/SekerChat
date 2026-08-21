import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import type { Response } from 'express';
import { AlbumController } from './album.controller';

test('content destroys the MinIO stream when the client disconnects early', async () => {
  const stream = new PassThrough();
  let closeListener: (() => void) | undefined;
  const response = {
    writableEnded: false,
    once(event: string, listener: () => void) {
      if (event === 'close') closeListener = listener;
      return this;
    },
    off() {
      return this;
    },
    setHeader() {
      return this;
    },
    vary() {
      return this;
    },
    status() {
      return this;
    },
  } as unknown as Response;
  const album = {
    getContent: async () => ({
      photo: { mimeType: 'video/mp4', size: 1_024 },
      stream,
      contentLength: 512,
      contentRange: 'bytes 0-511/1024',
    }),
  };
  const controller = new AlbumController(album as never);

  await controller.content('video-id', 'bytes=0-511', response);
  assert.ok(closeListener);
  closeListener();

  assert.equal(stream.destroyed, true);
});
