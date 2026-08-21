import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArtifactWorkflowService } from './artifact-workflow.service';

test('ArtifactWorkflowService atomically resets confirmation and records an outbox event', async () => {
  const calls: string[] = [];
  const transaction = {
    group: {
      update: async () => {
        calls.push('confirmation:cleared');
      },
    },
  };
  const workflow = new ArtifactWorkflowService(
    {
      user: {
        findUnique: async () => ({ displayName: 'User 1' }),
      },
      $transaction: async (operation: (tx: typeof transaction) => Promise<void>) =>
        operation(transaction),
    } as never,
    {
      createSystemMessage: async (_groupId: string, _actorUserId: string, text: string) => {
        calls.push(`system:${text}`);
      },
    } as never,
    {
      publishGroupUpdated: async (groupId: string) => {
        calls.push(`realtime:${groupId}`);
      },
    } as never,
    {
      enqueue: async (_tx: unknown, event: { eventType: string }) => {
        calls.push(`outbox:${event.eventType}`);
      },
    } as never,
  );

  await workflow.recordArtifactUploaded('group-1', 'user-1', 'report.md');

  assert.deepEqual(calls, ['confirmation:cleared', 'outbox:artifact.uploaded.v1']);
});
