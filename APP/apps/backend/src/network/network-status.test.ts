import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getNetworkStatus } from './network-status';

test('classifies actual bundled IPv4 and IPv6 country data, including mapped IPv4', () => {
  for (const ip of ['114.114.114.114', '223.5.5.5', '2400:3200::1', '::ffff:223.5.5.5']) {
    assert.deepEqual(getNetworkStatus(ip), { showWarning: false }, ip);
  }
  for (const ip of ['8.8.8.8', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
    assert.deepEqual(getNetworkStatus(ip), { showWarning: true }, ip);
  }
});

test('private, special-purpose, invalid and unknown addresses never warn', () => {
  for (const ip of [
    undefined,
    '',
    'invalid',
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '169.254.0.1',
    '192.0.2.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:192.168.1.1',
    '224.0.0.1',
  ]) {
    assert.deepEqual(getNetworkStatus(ip), { showWarning: false }, ip);
  }
});
