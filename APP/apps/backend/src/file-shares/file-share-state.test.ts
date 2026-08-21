import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveFileShareStatus } from './file-share-state';

const now = new Date('2026-08-10T10:00:00.000Z');

test('active share stays active when its message or creator state changes', () => {
  assert.equal(resolveFileShareStatus({
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: null,
    revokedReason: null,
    groupArchivedAt: null,
  }, now), 'ACTIVE');
});

test('expiry, manual revocation, and channel archive are distinct unavailable states', () => {
  assert.equal(resolveFileShareStatus({
    expiresAt: new Date('2026-08-09T10:00:00.000Z'),
    revokedAt: null,
    revokedReason: null,
    groupArchivedAt: null,
  }, now), 'EXPIRED');
  assert.equal(resolveFileShareStatus({
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: now,
    revokedReason: 'MANUAL',
    groupArchivedAt: null,
  }, now), 'REVOKED');
  assert.equal(resolveFileShareStatus({
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: null,
    revokedReason: null,
    groupArchivedAt: now,
  }, now), 'CHANNEL_ARCHIVED');
});

test('an archive-revoked share becomes a regular revoked share after the channel is unarchived', () => {
  assert.equal(resolveFileShareStatus({
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: new Date('2026-08-10T09:00:00.000Z'),
    revokedReason: 'CHANNEL_ARCHIVED',
    groupArchivedAt: null,
  }, now), 'REVOKED');
});
