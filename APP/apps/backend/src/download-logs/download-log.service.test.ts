import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { DownloadLogService } from './download-log.service';

test('service lifecycle persists diagnostics in the configured directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'download-service-'));
  try {
    const service = new DownloadLogService(new ConfigService({ DOWNLOAD_LOG_DIR: directory }));
    service.onModuleInit();
    service.record({ source: 'server', event: 'completed', downloadId: 'fixture' });
    await service.onModuleDestroy();
    const [name] = await readdir(directory);
    assert.match(await readFile(join(directory, name), 'utf8'), /fixture/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
