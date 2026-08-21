import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PublicFileSharesController } from './public-file-shares.controller';

function responseHarness() {
  const headers = new Map<string, unknown>();
  return {
    headers,
    response: {
      cookie: () => undefined,
      setHeader: (name: string, value: unknown) => headers.set(name, value),
      status: () => undefined,
    },
  };
}

test('public unlock and content responses prevent caching and vary by cookie', async () => {
  const auditLogs: string[] = [];
  const service = {
    unlock: async () => ({
      shareId: 'share-1',
      fileName: 'release.zip',
      mimeType: 'application/zip',
      size: '4',
      session: 'session',
      sessionExpiresAt: new Date().toISOString(),
      activatedBy: {
        id: 'internal-user',
        displayName: '内部用户',
        avatarUrl: '/api/avatars/users/internal-user',
      },
    }),
    getPublicFileContent: async () => ({
      mimeType: 'application/zip',
      fileName: 'release.zip',
      size: 4n,
      stream: 'stream',
      contentLength: 4,
      contentRange: undefined,
    }),
    getPublicFileMetadata: async () => ({
      mimeType: 'application/zip',
      fileName: 'release.zip',
      size: 4n,
    }),
  };
  const controller = new PublicFileSharesController(
    service as never,
    { hashToken: () => 'hash', fingerprintClientAddress: () => 'client-hmac' } as never,
    { assertAllowed: async () => undefined, reset: async () => undefined } as never,
    { getOrThrow: () => 'http://chat.test' } as never,
  );
  Object.assign((controller as any).logger, {
    log: (...values: unknown[]) => auditLogs.push(JSON.stringify(values)),
    warn: (...values: unknown[]) => auditLogs.push(JSON.stringify(values)),
  });

  const unlockResponse = responseHarness();
  const publicResult = await controller.unlock(
    { token: 'abcdefghijklmnopqrstuvwxyz', password: 'aB3x' },
    { ip: '198.51.100.10', headers: {} } as never,
    unlockResponse.response as never,
  );
  assert.deepEqual(publicResult, {
    shareId: 'share-1',
    fileName: 'release.zip',
    mimeType: 'application/zip',
    size: '4',
  });
  assert.equal(unlockResponse.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(unlockResponse.headers.get('Vary'), 'Cookie');
  assert.equal(auditLogs.length, 1);
  assert.doesNotMatch(auditLogs[0], /abcdefghijklmnopqrstuvwxyz|aB3x|session/);
  assert.match(auditLogs[0], /share-1|requestId|success/);

  const contentResponse = responseHarness();
  await controller.content(
    'share-1',
    { headers: { cookie: 'seker_file_share=session' } } as never,
    undefined,
    contentResponse.response as never,
  );
  assert.equal(contentResponse.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(contentResponse.headers.get('Vary'), 'Cookie');

  const headResponse = responseHarness();
  await controller.head(
    'share-1',
    { headers: { cookie: 'seker_file_share=session' } } as never,
    headResponse.response as never,
  );
  assert.equal(headResponse.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(headResponse.headers.get('Vary'), 'Cookie');
  assert.equal(
    headResponse.headers.get('Content-Disposition'),
    'attachment; filename="release.zip"; filename*=UTF-8\'\'release.zip',
  );
});

test('public unlock throttling uses the address resolved by the explicit Express trust chain', () => {
  const tracker = Reflect.getMetadata(
    'THROTTLER:TRACKERdefault',
    PublicFileSharesController.prototype.unlock,
  ) as ((request: Record<string, unknown>) => string) | undefined;

  assert.equal(typeof tracker, 'function');
  const trustedClient = tracker!({
    ip: '198.51.100.10',
    socket: { remoteAddress: '172.18.0.3' },
    headers: { 'x-forwarded-for': '198.51.100.10' },
  });
  const directUntrustedClient = tracker!({
    ip: '172.18.0.3',
    socket: { remoteAddress: '172.18.0.3' },
    headers: { 'x-forwarded-for': '203.0.113.20' },
  });

  assert.equal(trustedClient, '198.51.100.10');
  assert.equal(directUntrustedClient, '172.18.0.3');
});

test('malformed download cookie is treated as missing instead of crashing the public endpoint', async () => {
  let receivedSession: string | undefined;
  const service = {
    getPublicFileMetadata: async (_shareId: string, session: string) => {
      receivedSession = session;
      return {
        mimeType: 'application/zip',
        fileName: 'release.zip',
        size: 4n,
      };
    },
  };
  const controller = new PublicFileSharesController(
    service as never,
    {} as never,
    {} as never,
    { getOrThrow: () => 'http://chat.test' } as never,
  );

  await controller.head(
    'share-1',
    { headers: { cookie: 'seker_file_share=%' } } as never,
    responseHarness().response as never,
  );

  assert.equal(receivedSession, '');
});
