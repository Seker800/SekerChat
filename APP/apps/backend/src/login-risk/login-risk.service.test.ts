import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { LoginRiskService } from './login-risk.service';

function buildMockPrisma() {
  const store = new Map<string, any>();

  return {
    loginRisk: {
      findUnique: async ({ where }: { where: { email_ip: { email: string; ip: string } } }) => {
        return store.get(`${where.email_ip.email}:${where.email_ip.ip}`) ?? null;
      },
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.email_ip.email}:${where.email_ip.ip}`;
        const existing = store.get(key);
        if (!existing) {
          const record = { id: `risk-${key}`, ...create, lockoutCount: 0, blacklistedAt: null, unblacklistedAt: null, unblacklistedBy: null, unblacklistNote: null, createdAt: new Date(), updatedAt: new Date() };
          store.set(key, record);
          return record;
        }
        const failedAttempts = (existing.failedAttempts ?? 0) + 1;
        const updated = { ...existing, failedAttempts, lastFailedAt: new Date() };
        store.set(key, updated);
        return updated;
      },
      update: async ({ where, data }: any) => {
        if (where.id) {
          const entry = [...store.values()].find((v) => v.id === where.id);
          if (entry) {
            Object.assign(entry, data, { updatedAt: new Date() });
            return entry;
          }
        }
        if (where.email_ip) {
          const key = `${where.email_ip.email}:${where.email_ip.ip}`;
          const entry = store.get(key);
          if (entry) {
            Object.assign(entry, data, { updatedAt: new Date() });
            return entry;
          }
        }
        return null;
      },
      findMany: async ({ where, orderBy, skip, take }: any) => {
        let results = [...store.values()];
        if (where?.blacklistedAt?.not === null) {
          results = results.filter((r) => r.blacklistedAt != null);
        }
        if (where?.OR) {
          results = results.filter((r) => {
            return where.OR.some((cond: any) => {
              if (cond.email?.contains) return r.email.includes(cond.email.contains);
              if (cond.ip?.contains) return r.ip.includes(cond.ip.contains);
              return false;
            });
          });
        }
        results.sort((a, b) => (b.blacklistedAt?.getTime() ?? 0) - (a.blacklistedAt?.getTime() ?? 0));
        return results.slice(skip ?? 0, (skip ?? 0) + (take ?? 20));
      },
      count: async ({ where }: any) => {
        let results = [...store.values()];
        if (where?.blacklistedAt?.not === null) {
          results = results.filter((r) => r.blacklistedAt != null);
        }
        if (where?.OR) {
          results = results.filter((r) => {
            return where.OR.some((cond: any) => {
              if (cond.email?.contains) return r.email.includes(cond.email.contains);
              if (cond.ip?.contains) return r.ip.includes(cond.ip.contains);
              return false;
            });
          });
        }
        return results.length;
      },
      delete: async () => {},
    },
    $transaction: async (fn: any) => {
      // Interactive transaction: pass mock as the tx client
      return fn({
        loginRisk: {
          findUnique: async ({ where }: any) => {
            return store.get(`${where.email_ip.email}:${where.email_ip.ip}`) ?? null;
          },
          upsert: async ({ where, create, update }: any) => {
            const key = `${where.email_ip.email}:${where.email_ip.ip}`;
            const existing = store.get(key);
            if (!existing) {
              const record = { id: `risk-${key}`, ...create, lockoutCount: 0, blacklistedAt: null, unblacklistedAt: null, unblacklistedBy: null, unblacklistNote: null, createdAt: new Date(), updatedAt: new Date() };
              store.set(key, record);
              return record;
            }
            const failedAttempts = (existing.failedAttempts ?? 0) + 1;
            const updated = { ...existing, failedAttempts, lastFailedAt: new Date() };
            store.set(key, updated);
            return updated;
          },
          update: async ({ where, data }: any) => {
            if (where.id) {
              const entry = [...store.values()].find((v: any) => v.id === where.id);
              if (entry) {
                Object.assign(entry, data, { updatedAt: new Date() });
                return entry;
              }
            }
            return null;
          },
        },
      } as any);
    },
  };
}

test('checkRisk returns ok for unknown email+ip', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);
  const result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'ok');
});

test('cumulative failures lead to lock', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);

  for (let i = 0; i < 5; i++) {
    await service.recordFailure('test@example.com', '192.168.1.1');
  }

  const result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'locked');
  assert.ok(typeof result.lockedMinutes === 'number');
  assert.ok(result.lockedMinutes! >= 1 && result.lockedMinutes! <= 15);
});

test('second lock leads to blacklist', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);

  // First lock: 5 failures -> locked
  for (let i = 0; i < 5; i++) {
    await service.recordFailure('test@example.com', '192.168.1.1');
  }
  let result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'locked');

  const entry = await mockPrisma.loginRisk.findUnique({ where: { email_ip: { email: 'test@example.com', ip: '192.168.1.1' } } });
  assert.ok(entry);
  assert.equal(entry.lockoutCount, 1);

  // Simulate lock expiry — set lockedUntil to the past
  await mockPrisma.loginRisk.update({
    where: { email_ip: { email: 'test@example.com', ip: '192.168.1.1' } },
    data: { lockedUntil: new Date(Date.now() - 60_000) },
  });

  // Second lock after expiry: 5 more failures -> blacklisted
  for (let i = 0; i < 5; i++) {
    await service.recordFailure('test@example.com', '192.168.1.1');
  }
  result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'blacklisted');
});

test('success clears failedAttempts and lockedUntil', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);

  // Create a record with failures and lock
  for (let i = 0; i < 5; i++) {
    await service.recordFailure('test@example.com', '192.168.1.1');
  }
  let result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'locked');

  await service.recordSuccess('test@example.com', '192.168.1.1');

  result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'ok');
});

test('admin unban clears blacklist', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);

  // First lock
  for (let i = 0; i < 5; i++) {
    await service.recordFailure('test@example.com', '192.168.1.1');
  }
  // Expire the lock
  await mockPrisma.loginRisk.update({
    where: { email_ip: { email: 'test@example.com', ip: '192.168.1.1' } },
    data: { lockedUntil: new Date(Date.now() - 60_000) },
  });
  // Second lock → blacklist
  for (let i = 0; i < 5; i++) {
    await service.recordFailure('test@example.com', '192.168.1.1');
  }
  let result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'blacklisted');

  // Unban
  const entry = await mockPrisma.loginRisk.findUnique({ where: { email_ip: { email: 'test@example.com', ip: '192.168.1.1' } } });
  assert.ok(entry);
  const unbanResult = await service.unblacklist(entry.id, 'admin-1', 'manual review');
  assert.equal(unbanResult.unblacklistedBy, 'admin-1');
  assert.equal(unbanResult.unblacklistNote, 'manual review');
  assert.equal(unbanResult.failedAttempts, 0);
  assert.equal(unbanResult.lockoutCount, 0);
  assert.equal(unbanResult.lockedUntil, null);

  result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'ok');
});

test('re-blacklist works after unban', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);

  // First blacklist cycle
  for (let i = 0; i < 5; i++) await service.recordFailure('test@example.com', '10.0.0.1');
  await mockPrisma.loginRisk.update({ where: { email_ip: { email: 'test@example.com', ip: '10.0.0.1' } }, data: { lockedUntil: new Date(Date.now() - 60_000) } });
  for (let i = 0; i < 5; i++) await service.recordFailure('test@example.com', '10.0.0.1');
  let result = await service.checkRisk('test@example.com', '10.0.0.1');
  assert.equal(result.status, 'blacklisted');

  // Admin unbans
  const entry = await mockPrisma.loginRisk.findUnique({ where: { email_ip: { email: 'test@example.com', ip: '10.0.0.1' } } });
  await service.unblacklist(entry.id, 'admin-1');
  result = await service.checkRisk('test@example.com', '10.0.0.1');
  assert.equal(result.status, 'ok');

  // Trigger blacklist again after unban
  for (let i = 0; i < 5; i++) await service.recordFailure('test@example.com', '10.0.0.1');
  await mockPrisma.loginRisk.update({ where: { email_ip: { email: 'test@example.com', ip: '10.0.0.1' } }, data: { lockedUntil: new Date(Date.now() - 60_000) } });
  for (let i = 0; i < 5; i++) await service.recordFailure('test@example.com', '10.0.0.1');
  result = await service.checkRisk('test@example.com', '10.0.0.1');
  assert.equal(result.status, 'blacklisted');
});

test('blacklisted account rejected immediately', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);

  // First lock
  for (let i = 0; i < 5; i++) {
    await service.recordFailure('test@example.com', '192.168.1.1');
  }
  // Expire the lock
  await mockPrisma.loginRisk.update({
    where: { email_ip: { email: 'test@example.com', ip: '192.168.1.1' } },
    data: { lockedUntil: new Date(Date.now() - 60_000) },
  });
  // Second lock → blacklist
  for (let i = 0; i < 5; i++) {
    await service.recordFailure('test@example.com', '192.168.1.1');
  }

  const result = await service.checkRisk('test@example.com', '192.168.1.1');
  assert.equal(result.status, 'blacklisted');
});

test('getBlacklist returns paginated results', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);

  // Create multiple blacklisted entries
  for (let i = 0; i < 3; i++) {
    // First lock
    for (let j = 0; j < 5; j++) {
      await service.recordFailure(`user${i}@example.com`, `10.0.0.${i}`);
    }
    // Expire
    await mockPrisma.loginRisk.update({
      where: { email_ip: { email: `user${i}@example.com`, ip: `10.0.0.${i}` } },
      data: { lockedUntil: new Date(Date.now() - 60_000) },
    });
    // Second lock → blacklist
    for (let j = 0; j < 5; j++) {
      await service.recordFailure(`user${i}@example.com`, `10.0.0.${i}`);
    }
  }

  const list = await service.getBlacklist();
  assert.ok(list.total >= 3);
  assert.ok(list.items.length >= 3);
});

test('getBlacklist supports search', async () => {
  const mockPrisma = buildMockPrisma();
  const service = new LoginRiskService(mockPrisma as any);

  // Create blacklisted entries — round 1 lock, expire, round 2 → blacklist
  for (let j = 0; j < 5; j++) await service.recordFailure('alice@example.com', '10.0.0.1');
  await mockPrisma.loginRisk.update({ where: { email_ip: { email: 'alice@example.com', ip: '10.0.0.1' } }, data: { lockedUntil: new Date(Date.now() - 60_000) } });
  for (let j = 0; j < 5; j++) await service.recordFailure('alice@example.com', '10.0.0.1');
  for (let j = 0; j < 5; j++) await service.recordFailure('bob@example.com', '10.0.0.2');
  await mockPrisma.loginRisk.update({ where: { email_ip: { email: 'bob@example.com', ip: '10.0.0.2' } }, data: { lockedUntil: new Date(Date.now() - 60_000) } });
  for (let j = 0; j < 5; j++) await service.recordFailure('bob@example.com', '10.0.0.2');

  const results = await service.getBlacklist({ search: 'alice' });
  assert.ok(results.total >= 1);
});
