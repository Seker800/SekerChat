import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { GroupCategoryService } from './group-category.service';

test('resetCategory refuses moving channels into the archived default Server', async () => {
  let moved = false;
  const service = new GroupCategoryService(
    {
      group: {
        findMany: async () => [{ id: 'g1' }],
        updateMany: async () => {
          moved = true;
        },
        count: async () => 1,
      },
    } as never,
    { publishGroupUpdated: async () => undefined } as never,
    { assertPermission: async () => undefined } as never,
    {
      findByName: async () => ({ id: 's1', name: '旧分类' }),
      ensureServerByName: async () => ({ id: 'default', archivedAt: new Date() }),
      resolveServer: async () => {
        throw new BadRequestException('Server 已归档');
      },
    } as never,
  );
  await assert.rejects(
    () => service.resetCategory({ sub: 'admin', role: 'SUPER_ADMIN' }, '旧分类'),
    /已归档/,
  );
  assert.equal(moved, false);
});

test('resetCategory lets SUPER_ADMIN move every channel and hides the emptied Server', async () => {
  const findManyArgs: unknown[] = [];
  const hidden: unknown[] = [];
  let categoryDeletes = 0;
  const service = new GroupCategoryService(
    {
      group: {
        findMany: async (args: unknown) => {
          findManyArgs.push(args);
          return [{ id: 'g1' }, { id: 'g2' }];
        },
        updateMany: async () => ({ count: 2 }),
        count: async () => 0,
      },
      category: {
        deleteMany: async () => {
          categoryDeletes += 1;
          return { count: 1 };
        },
      },
    } as never,
    { publishGroupUpdated: async () => undefined } as never,
    { assertPermission: async () => undefined } as never,
    {
      findByName: async () => ({ id: 's1', name: '旧分类' }),
      resolveServer: async () => ({ id: 'default', archivedAt: null }),
      hideIfEmpty: async (...args: unknown[]) => {
        hidden.push(args);
      },
    } as never,
  );

  const result = await service.resetCategory({ sub: 'super-1', role: 'SUPER_ADMIN' }, '旧分类');

  assert.equal(result.updatedGroupCount, 2);
  assert.deepEqual((findManyArgs[0] as { where: unknown }).where, {
    isDM: false,
    serverId: 's1',
  });
  assert.deepEqual(hidden, [[{ sub: 'super-1', role: 'SUPER_ADMIN' }, 's1', 'category_reset']]);
  assert.equal(categoryDeletes, 1);
});

test('resetCategory keeps membership scoping and does not hide for non-super-admins', async () => {
  const findManyArgs: unknown[] = [];
  let hideCalls = 0;
  const service = new GroupCategoryService(
    {
      group: {
        findMany: async (args: unknown) => {
          findManyArgs.push(args);
          return [];
        },
        updateMany: async () => ({ count: 0 }),
        count: async () => 0,
      },
      category: { deleteMany: async () => ({ count: 1 }) },
    } as never,
    { publishGroupUpdated: async () => undefined } as never,
    { assertPermission: async () => undefined } as never,
    {
      findByName: async () => ({ id: 's1', name: '旧分类' }),
      resolveServer: async () => ({ id: 'default', archivedAt: null }),
      hideIfEmpty: async () => {
        hideCalls += 1;
      },
    } as never,
  );

  await service.resetCategory({ sub: 'admin-1', role: 'ADMIN' }, '旧分类');

  assert.deepEqual((findManyArgs[0] as { where: unknown }).where, {
    isDM: false,
    serverId: 's1',
    members: { some: { userId: 'admin-1' } },
  });
  assert.equal(hideCalls, 0);
});

test('resetCategory hides an already-empty Server for SUPER_ADMIN', async () => {
  const hidden: unknown[] = [];
  const service = new GroupCategoryService(
    {
      group: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
        count: async () => 0,
      },
      category: { deleteMany: async () => ({ count: 1 }) },
    } as never,
    { publishGroupUpdated: async () => undefined } as never,
    { assertPermission: async () => undefined } as never,
    {
      findByName: async () => ({ id: 's1', name: '旧分类' }),
      resolveServer: async () => ({ id: 'default', archivedAt: null }),
      hideIfEmpty: async (...args: unknown[]) => {
        hidden.push(args);
      },
    } as never,
  );

  await service.resetCategory({ sub: 'super-1', role: 'SUPER_ADMIN' }, '旧分类');

  assert.deepEqual(hidden, [[{ sub: 'super-1', role: 'SUPER_ADMIN' }, 's1', 'category_reset']]);
});

test('resetCategory ignores legacy names that resolve to a renamed Server', async () => {
  let moved = false;
  let hideCalls = 0;
  const service = new GroupCategoryService(
    {
      group: {
        findMany: async () => {
          moved = true;
          return [];
        },
        updateMany: async () => {
          moved = true;
          return { count: 0 };
        },
        count: async () => 0,
      },
      category: { deleteMany: async () => ({ count: 0 }) },
    } as never,
    { publishGroupUpdated: async () => undefined } as never,
    { assertPermission: async () => undefined } as never,
    {
      findByName: async () => ({ id: 's1', name: '新名字' }),
      resolveServer: async () => ({ id: 'default', archivedAt: null }),
      hideIfEmpty: async () => {
        hideCalls += 1;
      },
    } as never,
  );

  const result = await service.resetCategory({ sub: 'super-1', role: 'SUPER_ADMIN' }, '旧名字');

  assert.equal(result.updatedGroupCount, 0);
  assert.equal(moved, false);
  assert.equal(hideCalls, 0);
});
