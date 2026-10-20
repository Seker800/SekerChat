import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExternalMessagesService } from '../../messages/external-messages.service';
import { QqBridgeIngestService } from './qq-bridge-ingest.service';

function stageFixture() {
  const uploads: Array<{ key: string; buffer: Buffer; mime: string }> = [];
  const records: Array<{ originalName: string; mimeType: string; storageKey: string }> = [];
  const service = new ExternalMessagesService(
    {
      uploadBufferToS3: async (key: string, buffer: Buffer, mime: string) =>
        uploads.push({ key, buffer, mime }),
    } as never,
    {
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          fileObject: {
            upsert: async (args: { create: (typeof records)[number] }) => {
              records.push(args.create);
              return { id: 'file', ...args.create };
            },
          },
        }),
    } as never,
  );
  service.getActor = async () => ({ id: 'integration' }) as never;
  return { service, uploads, records };
}

test('external files reserve a recoverable reference and preserve names while forcing download MIME', async () => {
  const { service, uploads, records } = stageFixture();
  const buffer = Buffer.from('# test\n');
  await service.stageFile('group', buffer, '架构建议.md');
  await service.stageFile('group', buffer, '架构建议.md');
  await service.stageFile('group', buffer, 'another.md');
  assert.equal(records[0].originalName, '架构建议.md');
  assert.equal(records[0].mimeType, 'application/octet-stream');
  assert.match(records[0].storageKey, /^external-files\/group\//);
  assert.equal(records[0].storageKey, records[1].storageKey);
  assert.notEqual(records[0].storageKey, records[2].storageKey);
  assert.deepEqual(uploads[0].buffer, buffer);
  await assert.rejects(() => service.stageFile('group', Buffer.alloc(0), 'empty.md'));
  await assert.rejects(() =>
    service.stageFile('group', Buffer.alloc(10 * 1024 * 1024 + 1), 'large.md'),
  );
  await assert.rejects(() => service.stageFile('group', buffer, 'bad\nname.md'));
});

function ingressFixture(files: Array<{ id: string; mimeType: string }>) {
  const inputs: Array<{ fileId?: string; attachmentType?: string }> = [];
  let staged = 0;
  const binding = { groupId: 'group', accountId: '12345', enabledAt: null };
  const tx = {
    qqBridgeSource: {
      findUnique: async () => null,
      create: async () => ({ id: 'source' }),
      update: async () => {},
    },
    qqBridgeDelivery: { findFirst: async () => null },
    fileObject: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        files.filter((file) => args.where.id.in.includes(file.id)),
    },
  };
  const access = { activeBinding: async () => binding };
  const svc = new QqBridgeIngestService(
    { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as never,
    access as never,
    {
      getActor: async () => ({ id: 'integration' }),
      create: async (_tx: unknown, input: (typeof inputs)[number]) => {
        inputs.push(input);
        return { id: 'message' };
      },
      stageFile: async () => {
        staged++;
        return { id: 'file' };
      },
    } as never,
    { notify: () => {} } as never,
  );
  const dto = {
    bindingId: 'binding',
    revision: 1,
    messageId: '1',
    senderId: '12345',
    displayName: '测试',
    occurredAt: new Date().toISOString(),
    parts: [{ type: 'file' as const, fileId: 'file' }],
  };
  return {
    svc,
    access,
    inputs,
    dto,
    get staged() {
      return staged;
    },
  };
}

test('binary references become file messages; missing, foreign and binary-avatar references are refused', async () => {
  const f = ingressFixture([{ id: 'file', mimeType: 'application/octet-stream' }]);
  await f.svc.ingest('connector', f.dto);
  assert.equal(f.inputs[0].fileId, 'file');
  assert.equal(f.inputs[0].attachmentType, 'file');
  await assert.rejects(
    () => f.svc.ingest('connector', { ...f.dto, avatarFileId: 'file' }),
    /有效图片/,
  );
  await assert.rejects(
    () => f.svc.ingest('connector', { ...f.dto, parts: [{ type: 'image', fileId: 'file' }] }),
    /有效图片/,
  );
  const foreign = ingressFixture([]);
  await assert.rejects(() => foreign.svc.ingest('connector', foreign.dto), /此绑定/);
  await assert.rejects(
    () => f.svc.ingest('connector', { ...f.dto, parts: [{ type: 'file' }] }),
    /缺少附件/,
  );
});

test('file uploads enforce active binding before staging and recheck after storage', async () => {
  const f = ingressFixture([]);
  const dto = { bindingId: 'binding', revision: 1, originalName: 'test.md' };
  let checks = 0;
  f.access.activeBinding = async () => {
    checks++;
    if (checks === 2) throw Error('binding disabled');
    return { groupId: 'group', accountId: '12345', enabledAt: null };
  };
  await assert.rejects(
    () => f.svc.uploadFile('connector', dto, Buffer.from('x')),
    /binding disabled/,
  );
  assert.equal(f.staged, 1);
  assert.equal(checks, 2);
  const blocked = ingressFixture([]);
  blocked.access.activeBinding = async () => {
    throw Error('forbidden');
  };
  await assert.rejects(
    () => blocked.svc.uploadFile('connector', dto, Buffer.from('x')),
    /forbidden/,
  );
  assert.equal(blocked.staged, 0);
});
