import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { ReminderSecureTransportGuard } from './reminder-secure-transport.guard';

function context(secure: boolean) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ secure }) }),
  } as never;
}

test('reminder credentials require HTTPS in production and allow local development HTTP', () => {
  const previous = process.env.NODE_ENV;
  const guard = new ReminderSecureTransportGuard();
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(() => guard.canActivate(context(false)), ForbiddenException);
    assert.equal(guard.canActivate(context(true)), true);
    process.env.NODE_ENV = 'development';
    assert.equal(guard.canActivate(context(false)), true);
  } finally {
    process.env.NODE_ENV = previous;
  }
});
