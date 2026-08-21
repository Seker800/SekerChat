import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderOidcRelayPage } from './oidc-relay';

test('OIDC relay page loads a same-origin static script and contains no inline JavaScript', () => {
  const page = renderOidcRelayPage();
  assert.match(page, /src="\/api\/auth\/browser\/oidc\/implicit\/relay\.js"/);
  assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)[^>]*>/i);
});
