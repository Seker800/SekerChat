import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OutboxEventStatus, type OutboxEvent } from '@prisma/client';
import { ServerLifecycleOutboxHandler } from './server-lifecycle-outbox.handler';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveGroupApplicationService } from '../group-lifecycle/archive-group-application.service';
import { OutboxService } from './outbox.service';
import { WorkStatusConfigService } from '../system-config/work-status-config.service';

for (const status of ['完成', '取消', '自定义结束']) {
  test(`restoring a Server preserves archived work status ${status} across retries`, async () => {
    const archivedAt = new Date('2026-10-01T00:00:00Z');
    const groups = [
      { id: 'active', archivedAt: null as Date | null, workState: { status: 'ing' } },
      { id: 'completed', archivedAt: archivedAt as Date | null, workState: { status } },
      { id: 'no-status', archivedAt: null as Date | null, workState: null },
    ];
    const events: unknown[] = [];
    let definitionReads = 0;
    const transaction = {
      group: {
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; archivedAt: unknown };
          data: { archivedAt: Date | null };
        }) => {
          const group = groups.find((group) => group.id === where.id)!;
          if ((where.archivedAt === null) !== (group.archivedAt === null)) return { count: 0 };
          group.archivedAt = data.archivedAt;
          return { count: 1 };
        },
      },
      fileShare: { updateMany: async () => ({ count: 0 }) },
      groupWorkState: {
        deleteMany: async () => assert.fail('Server restore must preserve work state'),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ServerLifecycleOutboxHandler,
        ArchiveGroupApplicationService,
        {
          provide: PrismaService,
          useValue: {
            group: { findMany: async () => groups },
            $transaction: async (operation: (tx: typeof transaction) => unknown) =>
              operation(transaction),
          },
        },
        {
          provide: OutboxService,
          useValue: { enqueue: async (_tx: unknown, event: unknown) => events.push(event) },
        },
        {
          provide: WorkStatusConfigService,
          useValue: {
            getDefinitions: async () => {
              definitionReads++;
              return [{ name: 'ing' }, { name: status, isArchive: true }];
            },
          },
        },
      ],
    }).compile();
    try {
      const handler = module.get(ServerLifecycleOutboxHandler);
      await handler.handle(lifecycleEvent(true));
      assert.ok(groups.every((group) => group.archivedAt));
      events.length = 0;

      const restore = lifecycleEvent(false);
      await handler.handle(restore);
      await handler.handle(restore);

      assert.equal(groups[0].archivedAt, null);
      assert.equal(groups[1].archivedAt, archivedAt);
      assert.equal(groups[1].workState?.status, status);
      assert.equal(groups[2].archivedAt, null);
      assert.equal(events.length, 2, 'retry must not duplicate channel lifecycle events');
      assert.equal(definitionReads, 2, 'load definitions once per restore, never per channel');
    } finally {
      await module.close();
    }
  });
}

test('server lifecycle fan-out reuses the idempotent channel archive application service', async () => {
  const commands: unknown[] = [];
  const handler = new ServerLifecycleOutboxHandler(
    {
      group: {
        findMany: async () => [{ id: 'group-1' }, { id: 'group-2' }],
      },
    } as never,
    {
      execute: async (command: unknown) => {
        commands.push(command);
      },
    } as never,
    {} as never,
  );
  const now = new Date();
  const event: OutboxEvent = {
    id: 'event-1',
    eventType: 'server.lifecycle.requested.v1',
    aggregateType: 'Server',
    aggregateId: 'server-1',
    payload: { serverId: 'server-1', archive: true },
    status: OutboxEventStatus.PROCESSING,
    attempts: 1,
    availableAt: now,
    lockedAt: now,
    processedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  await handler.handle(event);

  assert.deepEqual(commands, [
    { groupId: 'group-1', archive: true, reason: 'server' },
    { groupId: 'group-2', archive: true, reason: 'server' },
  ]);
});

function lifecycleEvent(archive: boolean): OutboxEvent {
  const now = new Date();
  return {
    id: 'event-1',
    eventType: 'server.lifecycle.requested.v1',
    aggregateType: 'Server',
    aggregateId: 'server-1',
    payload: { serverId: 'server-1', archive },
    status: OutboxEventStatus.PROCESSING,
    attempts: 1,
    availableAt: now,
    lockedAt: now,
    processedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}
