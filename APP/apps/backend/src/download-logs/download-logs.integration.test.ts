import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Controller, Get, StreamableFile, ValidationPipe, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DownloadLogsController } from './download-logs.controller';
import { DownloadLogService } from './download-log.service';
import { DownloadLoggingInterceptor } from './download-logging.interceptor';

@Controller('groups/:groupId/files')
@UseGuards(JwtAuthGuard)
class DownloadFixtureController {
  @Get(':fileId/content')
  content() {
    return new StreamableFile(Buffer.from('real streamed bytes'), { length: 19 });
  }
}

test('HTTP download and diagnostic endpoint enforce identity, validation and rate limits', async () => {
  const rows: any[] = [];
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 1000, limit: 1000 }])],
    controllers: [DownloadLogsController, DownloadFixtureController],
    providers: [
      { provide: DownloadLogService, useValue: { record: (record: unknown) => rows.push(record) } },
      { provide: APP_INTERCEPTOR, useClass: DownloadLoggingInterceptor },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate(context: any) {
        const request = context.switchToHttp().getRequest();
        if (request.headers.authorization !== 'Bearer fixture-token') return false;
        request.user = { sub: 'verified-user' };
        return true;
      },
    })
    .compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(0, '127.0.0.1');
  try {
    const base = await app.getUrl();
    const response = await fetch(`${base}/api/groups/g/files/f/content`, {
      headers: { Authorization: 'Bearer fixture-token' },
    });
    assert.equal(await response.text(), 'real streamed bytes');
    assert.equal(rows.at(-1).event, 'completed');
    const id = response.headers.get('x-download-id');
    assert.ok(id);
    const dto = {
      downloadId: id,
      resourceKind: 'file',
      resourceId: 'f',
      event: 'completed',
      bytes: 19,
      expectedBytes: 19,
      elapsedMs: 1200,
      firstByteMs: 200,
      maxGapMs: 100,
      cacheStatus: 'network',
      errorCode: null,
    };
    const post = (body: unknown, authenticated = true) =>
      fetch(`${base}/api/download-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authenticated ? { Authorization: 'Bearer fixture-token' } : {}),
        },
        body: JSON.stringify(body),
      });
    assert.equal((await post(dto, false)).status, 403);
    assert.equal((await post({ ...dto, userId: 'forged-user' })).status, 400);
    assert.equal((await post({ ...dto, bytes: -1 })).status, 400);
    assert.equal((await post({ ...dto, elapsedMs: 1 })).status, 400);
    assert.equal((await post({ ...dto, errorCode: 'token=secret' })).status, 400);
    assert.equal((await post(dto)).status, 204);
    assert.equal(rows.at(-1).source, 'client_reported');
    assert.equal(rows.at(-1).userId, 'verified-user');
    assert.equal(rows.at(-1).averageBytesPerSecond, 19);
    assert.equal(rows.at(-1).downloadId, id);
    let rateLimited = false;
    for (let i = 0; i < 125; i++) {
      if ((await post(dto)).status === 429) {
        rateLimited = true;
        break;
      }
    }
    assert.equal(rateLimited, true);
  } finally {
    await app.close();
  }
});
