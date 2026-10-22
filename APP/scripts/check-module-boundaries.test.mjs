import { moduleBoundaryRules } from './module-boundary-rules.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { findModuleBoundaryViolations } from './module-boundaries.mjs';

const rules = [
  {
    name: 'shared packages cannot depend on application implementations',
    from: /^packages\//,
    disallow: /^apps\//,
  },
];

test('module boundary checker reports forbidden resolved imports', () => {
  const violations = findModuleBoundaryViolations(
    new Map([
      [
        'packages/shared/src/permissions.ts',
        new Set(['apps/backend/src/system-config/permission.service.ts']),
      ],
    ]),
    rules,
  );

  assert.deepEqual(violations, [
    {
      rule: 'shared packages cannot depend on application implementations',
      importer: 'packages/shared/src/permissions.ts',
      dependency: 'apps/backend/src/system-config/permission.service.ts',
    },
  ]);
});

test('module boundary checker permits applications to consume shared packages', () => {
  const violations = findModuleBoundaryViolations(
    new Map([
      [
        'apps/backend/src/system-config/permission.service.ts',
        new Set(['packages/shared/src/permissions.ts']),
      ],
    ]),
    rules,
  );

  assert.deepEqual(violations, []);
});

test('generic upload contracts remain domain-neutral', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'apps/backend/src/uploads/dto/initiate-upload.dto.ts'),
    'utf8',
  );

  assert.doesNotMatch(source, /eagle/i);
});

test('business services cannot depend on full realtime or HTTP adapters', () => {
  const graph = new Map([['apps/backend/src/groups/group-query.service.ts', new Set([
    'apps/backend/src/realtime/realtime.service.ts', 'apps/backend/src/files/files.controller.ts',
  ])]]);
  assert.equal(findModuleBoundaryViolations(graph, moduleBoundaryRules).length, 2);
});
test('module wiring and narrow realtime adapter implementations remain allowed', () => {
  const graph = new Map([
    ['apps/backend/src/groups/groups.module.ts', new Set(['apps/backend/src/groups/groups.controller.ts'])],
    ['apps/backend/src/subscriptions/subscription-realtime-publisher.service.ts', new Set(['apps/backend/src/realtime/realtime.service.ts'])],
  ]);
  assert.deepEqual(findModuleBoundaryViolations(graph, moduleBoundaryRules), []);
});
