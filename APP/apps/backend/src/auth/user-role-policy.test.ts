import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserRole } from '@prisma/client';
import { resolveBootstrapRole, resolveSeedRole } from './user-role-policy';

test('resolveBootstrapRole only grants the first SUPER_ADMIN to the configured bootstrap email', () => {
  const bootstrapRole = resolveBootstrapRole(0, 'owner@example.com', new Set(), 'owner@example.com');
  const memberRole = resolveBootstrapRole(0, 'member@example.com', new Set(), 'owner@example.com');

  assert.equal(bootstrapRole, UserRole.SUPER_ADMIN);
  assert.equal(memberRole, UserRole.MEMBER);
});

test('resolveBootstrapRole promotes configured admin emails after bootstrap', () => {
  const role = resolveBootstrapRole(3, 'admin@example.com', new Set(['admin@example.com']), null);
  assert.equal(role, UserRole.ADMIN);
});

test('resolveBootstrapRole keeps non-admin emails as MEMBER after bootstrap', () => {
  const role = resolveBootstrapRole(3, 'member@example.com', new Set(['admin@example.com']), null);
  assert.equal(role, UserRole.MEMBER);
});

test('resolveSeedRole never downgrades an existing SUPER_ADMIN', () => {
  const role = resolveSeedRole(UserRole.SUPER_ADMIN, 5);
  assert.equal(role, UserRole.SUPER_ADMIN);
});

test('resolveSeedRole bootstraps the first seeded admin as SUPER_ADMIN', () => {
  const role = resolveSeedRole(null, 0);
  assert.equal(role, UserRole.SUPER_ADMIN);
});

test('resolveSeedRole keeps later seeded admins at ADMIN', () => {
  const role = resolveSeedRole(UserRole.MEMBER, 5);
  assert.equal(role, UserRole.ADMIN);
});
