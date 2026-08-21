import assert from 'node:assert/strict';
import test from 'node:test';
import { SystemConfigService } from './system-config.service';

test('getStorageStats includes artifact storage as a separate dimension', async () => {
  const rows = [
    [{ count: 12n }],
    [{ total_bytes: '1024', file_count: 2n }],
    [{ total_bytes: '2048', file_count: 3n }],
    [{ total_bytes: '4096', file_count: 4n }],
  ];
  const prisma = {
    $queryRaw: async () => rows.shift(),
  };
  const service = new SystemConfigService(
    {} as never,
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const stats = await service.getStorageStats();

  assert.equal(stats.artifactCount, 4);
  assert.equal(stats.artifactStorageBytes, '4096');
  assert.equal(stats.totalAttachmentStorageBytes, '3072');
  assert.equal(stats.totalStorageBytes, '7168');
});
