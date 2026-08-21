import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canManageFileShare } from './file-share-policy';

test('uploader can manage a file share in a normal channel', () => {
  assert.equal(
    canManageFileShare({
      membershipRole: 'MEMBER',
      archivedAt: null,
    }),
    true,
  );
});

test('channel admin can manage another member file', () => {
  assert.equal(
    canManageFileShare({
      membershipRole: 'ADMIN',
      archivedAt: null,
    }),
    true,
  );
});

test('every channel member can manage another member file', () => {
  assert.equal(
    canManageFileShare({
      membershipRole: 'MEMBER',
      archivedAt: null,
    }),
    true,
  );
});

test('DM members can manage peer files, while non-members and archived channels cannot', () => {
  assert.equal(
    canManageFileShare({
      membershipRole: 'MEMBER',
      archivedAt: null,
    }),
    true,
  );
  assert.equal(
    canManageFileShare({
      membershipRole: null,
      archivedAt: null,
    }),
    false,
  );
  assert.equal(
    canManageFileShare({
      membershipRole: 'ADMIN',
      archivedAt: new Date(),
    }),
    false,
  );
});
