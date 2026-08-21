import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FileShareCredentialsService } from './file-share-credentials.service';

function createService() {
  return new FileShareCredentialsService({
    getOrThrow(key: string) {
      assert.equal(key, 'FILE_ACCESS_SECRET');
      return 'local-test-file-share-secret';
    },
  } as never);
}

test('generatePassword creates a copyable high-entropy password with at least sixteen characters', () => {
  const service = createService();

  for (let index = 0; index < 200; index += 1) {
    const password = service.generatePassword();
    assert.match(password, /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{16}$/);
  }
});

test('encrypted password can be recovered but plaintext is not embedded in storage', () => {
  const service = createService();
  const encrypted = service.encryptPassword('aB3x');

  assert.notEqual(encrypted, 'aB3x');
  assert.equal(encrypted.includes('aB3x'), false);
  assert.equal(service.decryptPassword(encrypted), 'aB3x');
});

test('password hash verifies the original password and rejects a different password', async () => {
  const service = createService();
  const hash = await service.hashPassword('aB3x');

  assert.equal(await service.verifyPassword('aB3x', hash), true);
  assert.equal(await service.verifyPassword('aB4x', hash), false);
});

test('public tokens are high entropy and only stable after hashing', () => {
  const service = createService();
  const first = service.generatePublicToken();
  const second = service.generatePublicToken();

  assert.notEqual(first, second);
  assert.ok(first.length >= 32);
  assert.equal(service.hashToken(first), service.hashToken(first));
  assert.notEqual(service.hashToken(first), service.hashToken(second));
});

test('signed download session is bound to one share and expires', () => {
  const service = createService();
  const session = service.createDownloadSession('share-1', new Date('2026-08-10T10:15:00.000Z'), 'token-v1');

  assert.equal(service.verifyDownloadSession(session, 'share-1', new Date('2026-08-10T10:10:00.000Z'), 'token-v1'), true);
  assert.equal(service.verifyDownloadSession(session, 'share-2', new Date('2026-08-10T10:10:00.000Z'), 'token-v1'), false);
  assert.equal(service.verifyDownloadSession(session, 'share-1', new Date('2026-08-10T10:10:00.000Z'), 'token-v2'), false);
  assert.equal(service.verifyDownloadSession(session, 'share-1', new Date('2026-08-10T10:16:00.000Z'), 'token-v1'), false);
});
