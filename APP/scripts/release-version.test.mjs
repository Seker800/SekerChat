import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validateReleaseVersion, validateReleaseVersionAvailability } from './release-version.mjs';

const packages = [
  { name: 'sekerchat', version: '0.7.0' },
  { name: '@sekerchat/backend', version: '0.7.0' },
  { name: '@sekerchat/frontend-react', version: '0.7.0' },
];

test('release image tag must match every workspace package version', () => {
  assert.equal(validateReleaseVersion('v0.7.0', packages), 'v0.7.0');
  assert.throws(
    () => validateReleaseVersion('v0.6.1', packages),
    /does not match package version 0\.7\.0/,
  );
  assert.throws(
    () => validateReleaseVersion('v0.7.0', [...packages, { name: '@sekerchat/reminder', version: '0.5.2' }]),
    /workspace version mismatch.*@sekerchat\/reminder=0\.5\.2/,
  );
});

test('release image tag uses a stable semantic version', () => {
  assert.throws(() => validateReleaseVersion('0.7.0', packages), /must use v<major>\.<minor>\.<patch>/);
  assert.throws(() => validateReleaseVersion('v0.7.0-review', packages), /must use v<major>\.<minor>\.<patch>/);
});

test('release image tag cannot reuse a Git tag or an existing artifact', () => {
  assert.equal(
    validateReleaseVersionAvailability('v0.9.2', { tagExists: false, artifactPaths: [] }),
    'v0.9.2',
  );
  assert.throws(
    () => validateReleaseVersionAvailability('v0.9.1', { tagExists: true, artifactPaths: [] }),
    /Git tag v0\.9\.1 already exists/,
  );
  assert.throws(
    () => validateReleaseVersionAvailability('v0.9.2', {
      tagExists: false,
      artifactPaths: ['sekerchat-backend-v0.9.2.tar.gz'],
    }),
    /release artifacts already exist.*sekerchat-backend-v0\.9\.2\.tar\.gz/,
  );
});
