import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, cp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { OutboxService } from '../outbox/outbox.service';

const enabled = process.env.SEKERCHAT_ARTICLE_VIEWS_INTEGRATION === '1';
const migrationName = '20261030050000_article_views';
test(
  'local PostgreSQL migrates legacy dates and deduplicates concurrent article views',
  { skip: !enabled },
  async () => {
    const raw = process.env.DATABASE_URL;
    assert.ok(raw, 'DATABASE_URL is required for the isolated local test');
    const source = new URL(raw);
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]', '::1'].includes(source.hostname),
      'Only loopback PostgreSQL is allowed',
    );
    const database = `sekerchat_article_views_${randomUUID().replaceAll('-', '')}`;
    assert.match(database, /^sekerchat_article_views_[a-f0-9]+$/);
    const isolated = new URL(source);
    isolated.pathname = `/${database}`;
    const admin = new PrismaClient({ datasources: { db: { url: source.toString() } } });
    let client: PrismaClient | undefined;
    const temp = await mkdtemp(path.join(tmpdir(), 'sekerchat-article-migration-'));
    const cli = require.resolve('prisma/build/index.js');
    const migrate = (schema: string) =>
      execFileSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: isolated.toString() },
        stdio: 'pipe',
      });
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
      await cp(path.resolve('prisma'), path.join(temp, 'prisma'), {
        recursive: true,
        filter: (sourcePath) => !sourcePath.includes(migrationName),
      });
      migrate(path.join(temp, 'prisma/schema.prisma'));
      client = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
      const [author, readUser, bothUser, pendingUser, newUser] = await Promise.all(
        ['author', 'read', 'both', 'pending', 'new'].map((name) =>
          client!.user.create({ data: { email: `${name}@article-views.test`, displayName: name } }),
        ),
      );
      const post = await client.subscriptionPost.create({
        data: {
          title: 'Legacy article',
          body: 'Body',
          authorId: author.id,
          status: 'PUBLISHED',
          publishedAt: new Date('2026-10-01T00:00:00Z'),
        },
      });
      await client.subscriptionPostRecipient.createMany({
        data: [
          { postId: post.id, userId: author.id, confirmedAt: new Date('2026-10-02T00:00:00Z') },
          { postId: post.id, userId: bothUser.id, confirmedAt: new Date('2026-10-04T00:00:00Z') },
          { postId: post.id, userId: pendingUser.id },
        ],
      });
      await client.subscriptionReadState.createMany({
        data: [
          { postId: post.id, userId: readUser.id, readAt: new Date('2026-10-03T00:00:00Z') },
          { postId: post.id, userId: bothUser.id, readAt: new Date('2026-10-01T12:00:00Z') },
        ],
      });
      migrate(path.resolve('prisma/schema.prisma'));
      const rows = await client.subscriptionPostView.findMany({ where: { postId: post.id } });
      assert.equal(rows.length, 3);
      assert.equal(
        rows.find((row) => row.userId === bothUser.id)!.firstViewedAt.toISOString(),
        '2026-10-01T12:00:00.000Z',
      );
      assert.equal(
        rows.some((row) => row.userId === pendingUser.id),
        false,
      );
      assert.equal(await client.subscriptionPostRecipient.count(), 3);
      assert.equal(await client.subscriptionReadState.count(), 2);
      const service = new SubscriptionsService(
        client as never,
        { assertPermission: async () => {}, hasPermission: async () => true } as never,
        new OutboxService(client as never),
        { publishSubscriptionChanged: async () => {} } as never,
      );
      const actor = { sub: newUser.id, role: 'MEMBER', email: newUser.email };
      const before = await service.getPublishedPost(actor as never, post.id);
      assert.equal(before.viewCount, 3);
      assert.equal(await client.subscriptionPostView.count(), 3);
      await Promise.all(Array.from({ length: 8 }, () => service.recordView(newUser.id, post.id)));
      assert.equal(await client.subscriptionPostView.count(), 4);
      assert.equal(await client.outboxEvent.count({ where: { aggregateId: post.id } }), 1);
      const first = (
        await client.subscriptionPostView.findUniqueOrThrow({
          where: { postId_userId: { postId: post.id, userId: newUser.id } },
        })
      ).firstViewedAt;
      await service.recordView(newUser.id, post.id);
      assert.equal(
        (
          await client.subscriptionPostView.findUniqueOrThrow({
            where: { postId_userId: { postId: post.id, userId: newUser.id } },
          })
        ).firstViewedAt.getTime(),
        first.getTime(),
      );
      await service.markUnread(newUser.id, post.id);
      await service.markAllRead(pendingUser.id);
      assert.equal(await client.subscriptionPostView.count(), 4);
      await service.withdraw({ ...actor, role: 'ADMIN' } as never, post.id);
      await assert.rejects(() => service.recordView(pendingUser.id, post.id), ConflictException);
      await assert.rejects(() => service.getPublishedPost(actor as never, post.id));
      // The same additive backfill is safe to re-run without replacing newer first-view times.
      const migration = await readFile(
        path.resolve(`prisma/migrations/${migrationName}/migration.sql`),
        'utf8',
      );
      await client.$executeRawUnsafe(
        migration.slice(migration.indexOf('INSERT INTO "SubscriptionPostView"')),
      );
      assert.equal(await client.subscriptionPostView.count(), 4);
    } finally {
      await client?.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.$disconnect();
      await rm(temp, { recursive: true, force: true });
    }
  },
);
