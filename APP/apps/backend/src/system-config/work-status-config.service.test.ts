import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkStatusDefDto } from './dto/update-system-config.dto';
import { WorkStatusConfigService } from './work-status-config.service';

function createServiceHarness(
  oldDefinitions: WorkStatusDefDto[],
  options?: { failGroupUpdate?: boolean; storedRaw?: string | null; requireAtomic?: boolean },
) {
  const calls = {
    advisoryLocks: 0,
    groupQueries: [] as Array<Record<string, unknown>>,
    archiveCommands: [] as Array<Record<string, unknown>>,
    workStateUpdates: [] as Array<Record<string, unknown>>,
    workStateDeletes: [] as Array<Record<string, unknown>>,
    storedValues: [] as Array<{ key: string; value: string }>,
  };

  let transactionActive = false;
  const requireTransaction = () => {
    if (options?.requireAtomic) assert.equal(transactionActive, true);
  };
  const prisma: any = {
    $executeRaw: async () => {
      requireTransaction();
      calls.advisoryLocks += 1;
      return 1;
    },
    systemConfig: {
      findUnique: async () => {
        requireTransaction();
        const value =
          options && 'storedRaw' in options
            ? (options.storedRaw ?? undefined)
            : JSON.stringify(oldDefinitions);
        return value === undefined ? null : { value };
      },
      upsert: async ({ where, create }: any) => {
        requireTransaction();
        calls.storedValues.push({ key: where.key, value: create.value });
      },
    },
    group: {
      findMany: async (input: Record<string, unknown>) => {
        requireTransaction();
        calls.groupQueries.push(input);
        return [{ id: 'group-1' }, { id: 'group-2' }];
      },
    },
    groupWorkState: {
      findMany: async () => [],
      updateMany: async (input: Record<string, unknown>) => {
        requireTransaction();
        calls.workStateUpdates.push(input);
        return { count: 0 };
      },
      deleteMany: async (input: Record<string, unknown>) => {
        requireTransaction();
        calls.workStateDeletes.push(input);
        return { count: 0 };
      },
    },
    groupWorkStateHistory: {
      updateMany: async () => {
        requireTransaction();
        return { count: 0 };
      },
    },
    $transaction: async <T>(operation: (transaction: typeof prisma) => Promise<T>) => {
      transactionActive = true;
      try {
        return await operation(prisma);
      } finally {
        transactionActive = false;
      }
    },
  };

  const store = {
    getValue: async () => {
      requireTransaction();
      return options && 'storedRaw' in options
        ? (options.storedRaw ?? undefined)
        : JSON.stringify(oldDefinitions);
    },
    upsert: async (key: string, value: string) => {
      requireTransaction();
      calls.storedValues.push({ key, value });
    },
  };

  return {
    calls,
    service: new WorkStatusConfigService(
      prisma as never,
      store as never,
      {
        execute: async (command: Record<string, unknown>, transaction: unknown) => {
          requireTransaction();
          if (options?.requireAtomic) assert.equal(transaction, prisma);
          calls.archiveCommands.push(command);
          if (options?.failGroupUpdate) throw new Error('group archive failed');
        },
      } as never,
    ),
  };
}

test('saving an archive work status archives every active non-DM group currently using it', async () => {
  const oldDefinitions: WorkStatusDefDto[] = [
    { name: '暂停', tone: '#444444', textTone: '#ff2600' },
    { name: '完成', tone: '#444444', textTone: '#3a88fe', isArchive: true },
  ];
  const newDefinitions: WorkStatusDefDto[] = [
    { ...oldDefinitions[0], isArchive: true },
    oldDefinitions[1],
  ];
  const { calls, service } = createServiceHarness(oldDefinitions);

  await service.updateFromDto({ workStatusDefs: newDefinitions });

  assert.equal(calls.groupQueries.length, 1);
  assert.deepEqual(calls.groupQueries[0], {
    where: {
      archivedAt: null,
      isDM: false,
      workState: {
        is: {
          status: { in: ['暂停', '完成'] },
        },
      },
    },
    select: { id: true },
  });
  assert.deepEqual(
    calls.archiveCommands.map((command) => command.groupId),
    ['group-1', 'group-2'],
  );
  assert.deepEqual(calls.storedValues, [
    { key: 'workStatusDefs', value: JSON.stringify(newDefinitions) },
  ]);
});

test('saving definitions without archive statuses does not change archived groups', async () => {
  const definitions: WorkStatusDefDto[] = [{ name: '暂停', tone: '#444444', textTone: '#ff2600' }];
  const { calls, service } = createServiceHarness(definitions);

  await service.updateFromDto({ workStatusDefs: definitions });

  assert.deepEqual(calls.groupQueries, []);
  assert.equal(calls.storedValues.length, 1);
});

test('renaming an archive status migrates work states before archiving matching groups', async () => {
  const oldDefinitions: WorkStatusDefDto[] = [
    { name: '暂停', tone: '#444444', textTone: '#ff2600' },
  ];
  const newDefinitions: WorkStatusDefDto[] = [
    { name: '搁置', tone: '#444444', textTone: '#ff2600', isArchive: true },
  ];
  const { calls, service } = createServiceHarness(oldDefinitions);

  await service.updateFromDto({ workStatusDefs: newDefinitions });

  assert.deepEqual(calls.workStateUpdates[0], {
    where: { status: '暂停' },
    data: { status: '搁置' },
  });
  assert.deepEqual(
    (calls.groupQueries[0].where as { workState: { is: { status: { in: string[] } } } }).workState
      .is.status.in,
    ['搁置'],
  );
});

test('a failed archive synchronization does not persist the new definitions', async () => {
  const oldDefinitions: WorkStatusDefDto[] = [
    { name: '暂停', tone: '#444444', textTone: '#ff2600' },
  ];
  const newDefinitions: WorkStatusDefDto[] = [{ ...oldDefinitions[0], isArchive: true }];
  const { calls, service } = createServiceHarness(oldDefinitions, { failGroupUpdate: true });

  await assert.rejects(
    () => service.updateFromDto({ workStatusDefs: newDefinitions }),
    /group archive failed/,
  );
  assert.deepEqual(calls.storedValues, []);
});

test('work-status migration, archival, and config persistence share one transaction', async () => {
  const oldDefinitions: WorkStatusDefDto[] = [
    { name: '暂停', tone: '#444444', textTone: '#ff2600' },
  ];
  const nextDefinitions: WorkStatusDefDto[] = [
    { name: '搁置', tone: '#444444', textTone: '#ff2600', isArchive: true },
  ];
  const { calls, service } = createServiceHarness(oldDefinitions, { requireAtomic: true });

  await service.updateFromDto({ workStatusDefs: nextDefinitions });

  assert.equal(calls.workStateUpdates.length, 1);
  assert.equal(calls.archiveCommands.length, 2);
  assert.equal(calls.advisoryLocks, 1);
  assert.deepEqual(calls.storedValues, [
    { key: 'workStatusDefs', value: JSON.stringify(nextDefinitions) },
  ]);
});

test('archive status lookup tolerates missing and malformed stored definitions', async () => {
  const missing = createServiceHarness([], { storedRaw: null }).service;
  const malformed = createServiceHarness([], { storedRaw: '{invalid' }).service;

  assert.deepEqual(await missing.getDefinitions(), []);
  assert.deepEqual(await malformed.getDefinitions(), []);
  assert.equal(await missing.isArchiveStatus('暂停'), false);
});

test('archive status lookup returns the configured archive flag', async () => {
  const definitions: WorkStatusDefDto[] = [
    { name: '暂停', tone: '#444444', textTone: '#ff2600', isArchive: true },
  ];
  const { service } = createServiceHarness(definitions);

  assert.equal(await service.isArchiveStatus('暂停'), true);
  assert.equal(await service.isArchiveStatus('ing'), false);
});

test('packaging status lookup supports custom names and legacy 打包 definitions', async () => {
  const custom = createServiceHarness([
    { name: '准备交付', tone: '#444444', textTone: '#ffffff', isPackaging: true },
  ]).service;
  const legacy = createServiceHarness([
    { name: '打包', tone: '#ffd93d', textTone: '#1e1f22' },
  ]).service;
  const conflictingStoredDefinition = createServiceHarness([
    {
      name: '旧状态',
      tone: '#444444',
      textTone: '#ffffff',
      isPackaging: true,
      isArchive: true,
    },
  ]).service;

  assert.equal(await custom.isPackagingStatus('准备交付'), true);
  assert.equal(await custom.isPackagingStatus('打包'), false);
  assert.equal(await legacy.isPackagingStatus('打包'), true);
  assert.equal(await conflictingStoredDefinition.isPackagingStatus('旧状态'), false);
});

test('saving rejects a work status that enables packaging and archive together', async () => {
  const definitions: WorkStatusDefDto[] = [
    {
      name: '交付完成',
      tone: '#444444',
      textTone: '#ffffff',
      isPackaging: true,
      isArchive: true,
    },
  ];
  const { calls, service } = createServiceHarness([]);

  await assert.rejects(
    () => service.updateFromDto({ workStatusDefs: definitions }),
    /不能同时启用打包和归档/,
  );
  assert.deepEqual(calls.storedValues, []);
});

test('updates unrelated to work statuses leave definitions and groups untouched', async () => {
  const { calls, service } = createServiceHarness([]);

  await service.updateFromDto({});

  assert.deepEqual(calls.groupQueries, []);
  assert.deepEqual(calls.storedValues, []);
});

test('removing a work status clears current states using that obsolete value', async () => {
  const oldDefinitions: WorkStatusDefDto[] = [
    { name: '暂停', tone: '#444444', textTone: '#ff2600' },
    { name: '完成', tone: '#444444', textTone: '#3a88fe' },
  ];
  const newDefinitions = [oldDefinitions[1]];
  const { calls, service } = createServiceHarness(oldDefinitions);

  await service.updateFromDto({ workStatusDefs: newDefinitions });

  assert.deepEqual(calls.workStateDeletes, [{ where: { status: '暂停' } }]);
});
