import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeObjectKeySegment } from './object-key';

test('object key segments keep display-like names intact', () => {
  assert.equal(sanitizeObjectKeySegment('report (2).md'), 'report (2).md');
  assert.equal(sanitizeObjectKeySegment('设计稿.png'), '设计稿.png');
});

test('object key segments cannot contain traversal or separators', () => {
  for (const input of ['../../etc/passwd', 'a/b/c.txt', '..\\..\\secret', '..', '.']) {
    const sanitized = sanitizeObjectKeySegment(input, 'file');
    assert.equal(sanitized.includes('/'), false, input);
    assert.equal(sanitized.includes('\\'), false, input);
    assert.equal(sanitized.includes('..'), false, input);
    assert.ok(sanitized.length > 0, input);
  }
});
