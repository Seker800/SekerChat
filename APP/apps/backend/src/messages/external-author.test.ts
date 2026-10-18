import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { readExternalAuthor } from './external-author';

test('external authors require a complete display snapshot and never infer identity from names', () => {
  assert.equal(readExternalAuthor(null), null);
  assert.equal(readExternalAuthor({ displayName: '群友' }), null);
  const first = readExternalAuthor({
    id: 'a',
    platform: 'qq',
    displayName: '同名',
    occurredAt: '2026-10-18T00:00:00Z',
  });
  const second = readExternalAuthor({
    id: 'b',
    platform: 'qq',
    displayName: '同名',
    occurredAt: '2026-10-18T00:00:00Z',
  });
  assert.notEqual(first?.id, second?.id);
});
