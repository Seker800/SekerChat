import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { of } from 'rxjs';
import { LegacyAuthTelemetryInterceptor } from './legacy-auth-telemetry.interceptor';

test('legacy auth calls receive deprecation headers without logging request credentials', () => {
  const headers = new Map<string, string>();
  const warnings: unknown[] = [];
  const interceptor = new LegacyAuthTelemetryInterceptor();
  (interceptor as any).logger = { warn: (entry: unknown) => warnings.push(entry) };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', originalUrl: '/api/auth/login', body: { password: 'secret' } }),
      getResponse: () => ({ setHeader: (name: string, value: string) => headers.set(name, value) }),
    }),
  } as any;

  interceptor.intercept(context, { handle: () => of({ ok: true }) });

  assert.equal(headers.get('Deprecation'), 'true');
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(JSON.stringify(warnings), /secret/);
});

test('reminder endpoint family is not marked as legacy', () => {
  const headers = new Map<string, string>();
  const interceptor = new LegacyAuthTelemetryInterceptor();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', originalUrl: '/api/auth/reminder/verify-code' }),
      getResponse: () => ({ setHeader: (name: string, value: string) => headers.set(name, value) }),
    }),
  } as any;
  interceptor.intercept(context, { handle: () => of({ ok: true }) });
  assert.equal(headers.size, 0);
});
