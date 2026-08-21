import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { UploadRecoveryService } from './upload-recovery.service';

test('recovery retries every recoverable upload session without stopping on one failure', async () => {
  const recovered: string[] = [];
  const recovery = new UploadRecoveryService(
    {
      uploadSession: {
        updateMany: async () => ({ count: 1 }),
        findMany: async () => [{ id: 'assembled-1' }, { id: 'failed-1' }, { id: 'assembled-2' }],
      },
    } as never,
    {
      recoverUploadSession: async (sessionId: string) => {
        recovered.push(sessionId);
        if (sessionId === 'failed-1') throw new Error('transient failure');
      },
    } as never,
  );

  await recovery.recoverPendingFinalizations();

  assert.deepEqual(recovered, ['assembled-1', 'failed-1', 'assembled-2']);
});
