import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PermissionService } from './permission.service';

test('PermissionService checks configured role permissions and can throw a standard forbidden error', async () => {
  const service = new PermissionService({
    getRolePermissions: async () => ({
      MEMBER: ['create_group'],
      ADMIN: ['create_group', 'manage_artifacts'],
      SUPER_ADMIN: ['create_group', 'manage_artifacts'],
    }),
  } as never);

  assert.equal(await service.hasPermission('ADMIN', 'manage_artifacts'), true);
  assert.equal(await service.hasPermission('MEMBER', 'manage_artifacts'), false);
  await assert.rejects(
    () => service.assertPermission('MEMBER', 'manage_artifacts'),
    ForbiddenException,
  );
});
