import assert from 'node:assert/strict';
import test from 'node:test';
import { UploadTargetRegistry } from './upload-target-registry';

test('upload target registry resolves one handler per extension kind', () => {
  const handler = { kind: 'CUSTOM_ASSET' };
  const registry = new UploadTargetRegistry([handler as never]);

  assert.equal(registry.get('CUSTOM_ASSET' as never), handler);
  assert.equal(registry.get('ALBUM_PHOTO' as never), undefined);
});

test('upload target registry rejects duplicate kind registrations', () => {
  assert.throws(
    () =>
      new UploadTargetRegistry([
        { kind: 'CUSTOM_ASSET' } as never,
        { kind: 'CUSTOM_ASSET' } as never,
      ]),
    /重复/,
  );
});
