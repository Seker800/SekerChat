import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveTrustedProxyCidrs } from './trusted-proxies';

test('trusted proxy configuration fails closed when no topology is configured', () => {
  assert.equal(resolveTrustedProxyCidrs(''), false);
  assert.equal(resolveTrustedProxyCidrs(undefined), false);
});

test('trusted proxy configuration accepts only the explicitly listed peers or networks', () => {
  assert.deepEqual(
    resolveTrustedProxyCidrs('172.29.0.10/32, 2001:db8::10/128 '),
    ['172.29.0.10/32', '2001:db8::10/128'],
  );
});
