import 'reflect-metadata';
import test from 'node:test';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageGateway } from './object-storage.gateway';
import { FilePreviewJobService } from './file-preview-job.service';
import { FilePreviewWorkerService } from './file-preview-worker.service';

async function main() {
  process.loadEnvFile(resolve(process.cwd(), '.env.development.local'));
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1'].includes(databaseUrl.hostname));
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.S3_ENDPOINT!).hostname));
  const name = `sekerchat_preview_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  databaseUrl.pathname = `/${name}`;
  const env = { ...process.env, DATABASE_URL: databaseUrl.toString() };
  let prisma: PrismaService | undefined;
  let objects: ObjectStorageGateway | undefined;
  const keys: string[] = [];
  try {
    const migration = spawnSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        resolve(process.cwd(), 'prisma/schema.prisma'),
      ],
      { env, encoding: 'utf8' },
    );
    assert.equal(migration.status, 0, migration.stdout + migration.stderr);
    process.env.DATABASE_URL = databaseUrl.toString();
    prisma = new PrismaService();
    const config = {
      get: (key: string) => process.env[key],
      getOrThrow: (key: string) => {
        assert.ok(process.env[key], key);
        return process.env[key];
      },
    };
    objects = new ObjectStorageGateway(config as never);
    const user = await prisma.user.create({
      data: { email: `preview-${randomUUID()}@local.invalid` },
    });
    const group = await prisma.group.create({
      data: { name: 'preview validation', createdById: user.id },
    });
    const create = async (name: string, input: Buffer) => {
      const storageKey = `validation/previews/${randomUUID()}/${name}`;
      keys.push(storageKey);
      await objects!.put(storageKey, input, 'image/png');
      return prisma!.fileObject.create({
        data: {
          groupId: group.id,
          uploaderId: user.id,
          originalName: name,
          mimeType: 'image/png',
          storageKey,
          size: input.length,
          previewJob: { create: {} },
        },
      });
    };
    const png = await sharp({
      create: { width: 6800, height: 11027, channels: 3, background: '#335577' },
    })
      .png()
      .toBuffer();
    const large = Buffer.concat([png, Buffer.alloc(51 * 1024 * 1024)]);
    const file = await create('large.png', large);
    const bad = await create('corrupt.png', Buffer.from('not an image'));
    const jobs = new FilePreviewJobService(prisma);
    const worker = new FilePreviewWorkerService(prisma, jobs, objects);
    const started = performance.now();
    await worker.processPendingJobs();
    const result = await prisma.fileObject.findUniqueOrThrow({
      where: { id: file.id },
      include: { previewJob: true },
    });
    assert.equal(result.previewJob?.status, 'READY');
    assert.equal(result.imageWidth, 6800);
    assert.equal(result.imageHeight, 11027);
    assert.ok(result.thumbnailStorageKey);
    keys.push(result.thumbnailStorageKey!);
    const preview = await objects.get(result.thumbnailStorageKey!);
    const thumbnail = Buffer.from(
      await preview.stream.toArray().then((chunks) => Buffer.concat(chunks)),
    );
    assert.equal((await sharp(thumbnail).metadata()).width, 247);
    const failed = await prisma.filePreviewJob.findUniqueOrThrow({ where: { fileId: bad.id } });
    assert.equal(failed.status, 'PENDING');
    assert.equal(failed.attempts, 1);
    assert.match(failed.lastError!, /unsupported image/);
    await prisma.filePreviewJob.update({
      where: { fileId: bad.id },
      data: { status: 'PROCESSING', attempts: 4, lockedAt: new Date(Date.now() - 600000) },
    });
    await new FilePreviewWorkerService(prisma, jobs, objects).processPendingJobs();
    assert.equal(
      (await prisma.filePreviewJob.findUniqueOrThrow({ where: { fileId: bad.id } })).status,
      'FAILED',
    );
    assert.equal(
      await jobs.complete(
        { fileId: bad.id, attempts: 1, leaseVersion: 0 },
        { imageWidth: 1, imageHeight: 1 },
      ),
      false,
    );
    await prisma.filePreviewJob.update({
      where: { fileId: bad.id },
      data: { status: 'PROCESSING', attempts: 5, lockedAt: new Date(Date.now() - 600000) },
    });
    assert.equal(await jobs.claimNext(), null);
    const exhaustedCrash = await prisma.filePreviewJob.findUniqueOrThrow({
      where: { fileId: bad.id },
    });
    assert.equal(exhaustedCrash.status, 'FAILED');
    assert.match(exhaustedCrash.lastError!, /repeatedly stopped/);
    const concurrent = await create('concurrent.png', png);
    const claims = await Promise.all([jobs.claimNext(), jobs.claimNext()]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean)?.fileId, concurrent.id);
    console.log(
      JSON.stringify({
        emptyDatabaseMigrations: 'passed',
        pixels: 6800 * 11027,
        inputBytes: large.length,
        thumbnailBytes: thumbnail.length,
        processingMs: Math.round(performance.now() - started),
        failurePersistence: 'passed',
        restartRecovery: 'passed',
        staleLeaseFencing: 'passed',
      }),
    );
  } finally {
    if (objects) for (const key of keys) await objects.delete(key);
    await prisma?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
}
test(
  'large previews persist, retry, recover leases, and migrate an empty local database',
  { skip: process.env.SEKERCHAT_PREVIEW_INTEGRATION !== '1', timeout: 60000 },
  main,
);
