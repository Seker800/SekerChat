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
      findByName: async () => ({ id: 's1' }),
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
