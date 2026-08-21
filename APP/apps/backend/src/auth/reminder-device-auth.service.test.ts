import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { ReminderDeviceAuthService } from './reminder-device-auth.service';

function createHarness() {
  const device = {
    id: 'device-1',
    userId: 'user-1',
    deviceName: 'desktop',
    revokedAt: null as Date | null,
    user: {
      email: 'member@example.com',
      displayName: 'Member',
      role: 'MEMBER',
      dndUntil: null,
    },
  };
  let ticket: any = null;
  const prisma: any = {
    reminderDeviceToken: {
      findFirst: async ({ where }: any) =>
        where.revokedAt === null && device.revokedAt === null ? device : null,
      findUnique: async () => device,
      updateMany: async ({ where, data }: any) => {
        if (where.id && where.id !== device.id) return { count: 0 };
        if (where.revokedAt === null && device.revokedAt !== null) return { count: 0 };
        Object.assign(device, data);
        return { count: 1 };
      },
    },
    reminderRealtimeTicket: {
      create: async ({ data }: any) => {
        ticket = { id: 'ticket-1', consumedAt: null, ...data };
        return ticket;
      },
      updateMany: async ({ where, data }: any) => {
        if (!ticket
          || ticket.tokenHash !== where.tokenHash
          || ticket.consumedAt
          || ticket.expiresAt <= where.expiresAt.gt
          || device.revokedAt) return { count: 0 };
        Object.assign(ticket, data);
        return { count: 1 };
      },
      findUnique: async () => ticket ? { ...ticket, reminderDeviceToken: device } : null,
      deleteMany: async () => ({ count: 0 }),
    },
    $transaction: async (operation: any) =>
      typeof operation === 'function' ? operation(prisma) : Promise.all(operation),
  };
  return { prisma, device, readTicket: () => ticket };
}

test('a realtime ticket is stored hashed, expires after sixty seconds, and can be consumed once', async () => {
  const harness = createHarness();
  const service = new ReminderDeviceAuthService(harness.prisma, {} as never);
  const issuedAt = new Date('2026-08-11T10:00:00.000Z');

  const issued = await service.issueRealtimeTicket('long-device-token', issuedAt);
  assert.equal(issued.expiresAt.toISOString(), '2026-08-11T10:01:00.000Z');
  assert.equal((harness.device as any).lastUsedAt, issuedAt);
  assert.notEqual(harness.readTicket().tokenHash, issued.ticket);

  const principal = await service.consumeRealtimeTicket(
    issued.ticket,
    new Date('2026-08-11T10:00:30.000Z'),
  );
  assert.equal(principal.deviceTokenId, 'device-1');
  assert.equal(principal.userId, 'user-1');

  await assert.rejects(
    () => service.consumeRealtimeTicket(issued.ticket, new Date('2026-08-11T10:00:31.000Z')),
    UnauthorizedException,
  );
});

test('expired tickets and tickets for revoked devices are rejected', async () => {
  const expiredHarness = createHarness();
  const expiredService = new ReminderDeviceAuthService(expiredHarness.prisma, {} as never);
  const expired = await expiredService.issueRealtimeTicket(
    'long-device-token',
    new Date('2026-08-11T10:00:00.000Z'),
  );
  await assert.rejects(
    () => expiredService.consumeRealtimeTicket(expired.ticket, new Date('2026-08-11T10:01:00.001Z')),
    UnauthorizedException,
  );

  const revokedHarness = createHarness();
  const revokedService = new ReminderDeviceAuthService(revokedHarness.prisma, {} as never);
  const revoked = await revokedService.issueRealtimeTicket(
    'long-device-token',
    new Date('2026-08-11T10:00:00.000Z'),
  );
  revokedHarness.device.revokedAt = new Date('2026-08-11T10:00:10.000Z');
  await assert.rejects(
    () => revokedService.consumeRealtimeTicket(revoked.ticket, new Date('2026-08-11T10:00:20.000Z')),
    UnauthorizedException,
  );
});

test('devices can be listed, revoked by owner, and rotated without exposing old tokens', async () => {
  const updates: any[] = [];
  const prisma: any = {
    user: {
      findUniqueOrThrow: async () => ({
        id: 'user-1',
        email: 'member@example.com',
        displayName: 'Member',
        role: 'MEMBER',
      }),
    },
    reminderDeviceToken: {
      findMany: async () => [{
        id: 'device-1',
        deviceName: 'desktop',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        revokedAt: null,
      }],
      findFirst: async () => ({ deviceName: 'desktop' }),
      updateMany: async (input: any) => {
        updates.push(input);
        return { count: 1 };
      },
      create: async ({ data }: any) => ({ id: 'device-2', ...data }),
    },
    $transaction: async (operation: any) => operation(prisma),
  };
  const service = new ReminderDeviceAuthService(prisma, {} as never);

  const devices = await service.listDevices('user-1');
  assert.equal(devices[0].lastUsedAt instanceof Date, true);
  await service.revokeDevice('user-1', 'device-1');
  assert.deepEqual(updates[0].where, { id: 'device-1', userId: 'user-1', revokedAt: null });

  const rotated = await service.rotateDevice('user-1', 'device-1');
  assert.equal(rotated.deviceTokenId, 'device-2');
  assert.equal(rotated.deviceName, 'desktop');
  assert.match(rotated.deviceToken, /^[A-Za-z\d_-]{43}$/);
  assert.deepEqual(updates[1].where, {
    userId: 'user-1',
    deviceName: 'desktop',
    revokedAt: null,
  });
});
