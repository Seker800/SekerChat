import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';

test('refresh token cleanup deletes only eligible rows in bounded batches', async () => {
  const rows = ['expired', 'revoked', 'active'];
  const deleted: string[] = [];
  const prisma = {
    refreshToken: {
      findMany: async ({ where }: any) => {
        assert.equal(where.OR.length, 2);
        return rows.filter((id) => id !== 'active').map((id) => ({ id }));
      },
      deleteMany: async ({ where }: any) => {
        const ids = where.AND[1].id.in as string[];
        deleted.push(...ids);
        rows.splice(0, 2);
        return { count: ids.length };
      },
    },
  };
  await new RefreshTokenCleanupService(prisma as never).cleanup();
  assert.deepEqual(deleted, ['expired', 'revoked']);
  assert.deepEqual(rows, ['active']);
});
