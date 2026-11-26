import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { QqBridgeDeliveryService } from './qq-bridge-delivery.service';

test('claim skips bindings whose Server is hidden instead of aborting the poll', async () => {
  const activeBindingCalls: string[] = [];
  const transaction = {
    $queryRaw: async () => [],
    qqBridgeConnector: {
      findUniqueOrThrow: async () => ({ enabled: true, revokedAt: null }),
    },
    qqBridgeBinding: {
      findMany: async () => [
        { id: 'binding-hidden', revision: 1 },
        { id: 'binding-visible', revision: 1 },
      ],
    },
    qqBridgeDelivery: {
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
      findFirst: async ({ where }: { where: { bindingId: string } }) => ({
        id: `delivery-${where.bindingId}`,
        bindingId: where.bindingId,
        revision: 1,
        status: 'pending',
      }),
      update: async () => undefined,
    },
  };
  const prisma = {
    $queryRaw: async () => [{ id: 'delivery-visible' }],
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
  };
  const access = {
    activeBinding: async (_tx: unknown, _connectorId: string, bindingId: string) => {
      activeBindingCalls.push(bindingId);
      if (bindingId === 'binding-hidden') throw new ForbiddenException('目标群不可用。');
      return { accountId: 'account-1', qqGroupId: 'qq-group-1' };
    },
  };
  const service = new QqBridgeDeliveryService(
    prisma as never,
    {} as never,
    access as never,
    {} as never,
  );

  const result = await service.claim('connector-1');

  assert.deepEqual(activeBindingCalls, ['binding-hidden', 'binding-visible']);
  assert.equal(result?.bindingId, 'binding-visible');
});

test('disabled bridge does not register a delivery sink on message writes', () => {
  let registered = 0;
  const intents = {
    register: () => {
      registered += 1;
      return () => undefined;
    },
  };
  const service = new QqBridgeDeliveryService(
    {} as never,
    intents as never,
    {} as never,
    {} as never,
    { isEnabled: () => false } as never,
  );

  service.onModuleInit();

  assert.equal(registered, 0);
});
