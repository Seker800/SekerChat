import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FilesController } from '../files/files.controller';
import { FilesService } from '../files/files.service';
import { UploadsController } from '../uploads/uploads.controller';
import { UploadsService } from '../uploads/uploads.service';
import { UploadResourceInterceptor } from '../uploads/upload-resource.interceptor';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

test('file and multipart HTTP endpoints reject anonymous requests before invoking application services', async () => {
  let invoked = false;
  const unreachable = () => { invoked = true; throw new Error('application code ran'); };
  const module = await Test.createTestingModule({ controllers: [FilesController, UploadsController], providers: [
    { provide: FilesService, useValue: { getFileMetadata: unreachable, getFileStream: unreachable } },
    { provide: UploadsService, useValue: { initiateUpload: unreachable, uploadPart: unreachable, completeUpload: unreachable } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => { throw new UnauthorizedException(); } })
    .overrideInterceptor(UploadResourceInterceptor).useValue({ intercept: unreachable }).compile();
  const app = module.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  try {
    const base = await app.getUrl();
    for (const [method, path] of [['GET', '/groups/g/files/f'], ['GET', '/groups/g/files/f/content'], ['POST', '/uploads/initiate'], ['PUT', '/uploads/s/parts/1'], ['POST', '/uploads/s/complete']]) {
      const response = await fetch(base + path, { method });
      assert.equal(response.status, 401, `${method} ${path}`);
      await response.body?.cancel();
    }
    assert.equal(invoked, false);
  } finally { await app.close(); }
});
