import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL || '').hostname),
);
assert.notEqual(process.env.NODE_ENV, 'production');
const requireBackend = createRequire(new URL('../apps/backend/package.json', import.meta.url));
const { PrismaClient } = requireBackend('@prisma/client');
const compiled = [
  '../apps/backend/dist/src/files/files.service.js',
  '../apps/backend/dist/files/files.service.js',
]
  .map((path) => fileURLToPath(new URL(path, import.meta.url)))
  .find(existsSync);
assert(compiled, 'build the local backend before running this check');
const { FilesService } = requireBackend(compiled);
const prisma = new PrismaClient();
let owner, group, file;
let deletedObjects = 0;
const files = new FilesService(
  prisma,
  {
    delete: async () => {
      deletedObjects++;
      return true;
    },
  },
  {},
  {},
  {},
);
const old = new Date(Date.now() - 2 * 86400000);
let release;
let upload;
try {
  owner = await prisma.user.create({
    data: { email: `qq-cleanup-check-${randomUUID()}@local.invalid`, disabledAt: new Date() },
  });
  group = await prisma.group.create({ data: { name: '本地清理竞态验收', createdById: owner.id } });
  file = await prisma.fileObject.create({
    data: {
      storageKey: `external-images/${group.id}/cleanup-check`,
      originalName: 'test.png',
      mimeType: 'image/png',
      size: 1,
      groupId: group.id,
      uploaderId: owner.id,
      updatedAt: old,
    },
  });
  // The orphan ID was selected before this avatar reference was attached.
  const message = await prisma.message.create({
    data: {
      senderId: owner.id,
      groupId: group.id,
      type: 'TEXT',
      text: 'synthetic',
      externalAvatarFileId: file.id,
    },
  });
  assert.equal(await files.purgeUnreferencedExternalImage(file.id), false);
  assert.equal(deletedObjects, 0);
  await prisma.message.delete({ where: { id: message.id } });

  let entered;
  const locked = new Promise((resolve) => {
    entered = resolve;
  });
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  upload = prisma.$transaction(
    async (tx) => {
      await tx.fileObject.update({ where: { id: file.id }, data: { updatedAt: new Date() } });
      entered();
      await hold;
    },
    { timeout: 10000 },
  );
  await locked;
  let completed = false;
  const cleanup = files.purgeUnreferencedExternalImage(file.id).then((result) => {
    completed = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(completed, false, 'cleanup must wait for the in-progress upload reservation');
  release();
  await upload;
  assert.equal(
    await cleanup,
    false,
    'fresh upload remains protected after cleanup obtains its lock',
  );
  assert.equal(deletedObjects, 0);

  await prisma.fileObject.update({ where: { id: file.id }, data: { updatedAt: old } });
  assert.equal(await files.purgeUnreferencedExternalImage(file.id), true);
  assert.equal(deletedObjects, 1);
  assert.equal(await prisma.fileObject.findUnique({ where: { id: file.id } }), null);
  console.log(
    'Local PostgreSQL cleanup race check passed: avatar references, row-lock contention, upload grace period, and expired orphan cleanup. Object storage was simulated.',
  );
} finally {
  release?.();
  await upload?.catch(() => {});
  if (group) {
    await prisma.message.deleteMany({ where: { groupId: group.id } });
    await prisma.fileObject.deleteMany({ where: { groupId: group.id } });
    await prisma.group.delete({ where: { id: group.id } });
  }
  if (owner) await prisma.user.delete({ where: { id: owner.id } });
  await prisma.$disconnect();
}
