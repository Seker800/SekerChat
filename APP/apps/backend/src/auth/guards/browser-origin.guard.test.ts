import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { BrowserOriginGuard } from './browser-origin.guard';

test('browser auth guard rejects production writes without trusted origin evidence', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const guard = new BrowserOriginGuard({ getOrThrow: () => 'https://im.example.com' } as any);
    assert.throws(
      () => guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ method: 'POST', headers: {} }) }),
      } as any),
      ForbiddenException,
    );
  } finally {
    process.env.NODE_ENV = previous;
  }
});
