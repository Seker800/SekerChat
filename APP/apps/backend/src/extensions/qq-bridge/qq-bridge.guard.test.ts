import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { GoneException } from '@nestjs/common';
import { QqBridgeGuard } from './qq-bridge.guard';

function context() {
  const request: { connector?: unknown; headers: Record<string, string> } = {
    headers: { authorization: 'Bearer qqb_test' },
  };
  return {
    request,
    execution: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
}

test('disabled bridge rejects before authenticating or touching the database', async () => {
  let authenticated = 0;
  const access = {
    authenticate: async () => {
      authenticated += 1;
      return { id: 'connector' };
    },
  };
  const availability = {
    assertEnabled: () => {
      throw new GoneException('QQ 桥接已停用。');
    },
  };
  const guard = new QqBridgeGuard(access as never, availability as never);
  const { execution } = context();

  await assert.rejects(() => guard.canActivate(execution), GoneException);
  assert.equal(authenticated, 0);
});

test('enabled bridge keeps the existing authentication path', async () => {
  const connector = { id: 'connector' };
  const access = { authenticate: async () => connector };
  const availability = { assertEnabled: () => undefined };
  const guard = new QqBridgeGuard(access as never, availability as never);
  const { execution, request } = context();

  assert.equal(await guard.canActivate(execution), true);
  assert.equal(request.connector, connector);
});
