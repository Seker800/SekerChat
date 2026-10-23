import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { QqBridgeDeliveryService } from './qq-bridge-delivery.service';
import { QqBridgeConnectorController } from './qq-bridge-connector.controller';

test(
  'local database: idle reads, concurrent durable claims, lease recovery and heartbeat isolation',
  {
    skip: process.env.QQ_BRIDGE_PERFORMANCE_DB !== '1',
  },
  async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
      'local database required',
    );
    const queries: string[] = [];
    const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    prisma.$on('query', (event) => queries.push(event.query));
    const key = randomUUID();
    const connectorId = randomUUID();
    const groupId = randomUUID();
    const userId = randomUUID();
    const bindingId = randomUUID();
    const service = new QqBridgeDeliveryService(
      prisma as never,
      {} as never,
      { activeBinding: async () => ({}) } as never,
      {} as never,
    );
    try {
      await prisma.user.create({ data: { id: userId, email: `${key}@performance.invalid` } });
      await prisma.group.create({
        data: { id: groupId, name: 'performance test', createdById: userId },
      });
      await prisma.qqBridgeConnector.create({
        data: { id: connectorId, name: 'performance test', tokenHash: key, enabled: true },
      });
      await prisma.qqBridgeBinding.create({
        data: {
          id: bindingId,
          connectorId,
          groupId,
          accountId: '1',
          qqGroupId: key,
          enabled: true,
          bidirectional: true,
        },
      });
      queries.length = 0;
      assert.equal(await service.claim(connectorId), null);
      assert.ok(queries.length > 0);
      assert.ok(queries.every((sql) => !/FOR UPDATE|BEGIN|UPDATE /i.test(sql)));

      const stale = await prisma.qqBridgeDelivery.create({
        data: { bindingId, messageId: `${key}-stale`, revision: 0 },
      });
      queries.length = 0;
      assert.equal(await service.claim(connectorId), null);
      assert.ok(
        queries.every((sql) => !/FOR UPDATE|BEGIN|UPDATE /i.test(sql)),
        'stale revision must remain read-only',
      );
      await prisma.qqBridgeDelivery.delete({ where: { id: stale.id } });

      const task = await prisma.qqBridgeDelivery.create({
        data: { bindingId, messageId: key, revision: 1 },
      });
      const claims = await Promise.all([service.claim(connectorId), service.claim(connectorId)]);
      assert.equal(claims.filter(Boolean).length, 1);
      assert.ok(!queries.some((sql) => sql.includes('synchronous_commit')));
      await prisma.qqBridgeDelivery.update({
        where: { id: task.id },
        data: { status: 'uncertain' },
      });
      await prisma.qqBridgeDelivery.create({
        data: { bindingId, messageId: `${key}-pending`, revision: 1 },
      });
      queries.length = 0;
      assert.equal(await service.claim(connectorId), null);
      assert.ok(
        queries.every((sql) => !/FOR UPDATE|BEGIN|UPDATE /i.test(sql)),
        'blocked binding must remain read-only',
      );

      await prisma.qqBridgeDelivery.update({
        where: { id: task.id },
        data: { status: 'started', leaseUntil: new Date(0) },
      });
      assert.equal(await service.claim(connectorId), null);
      assert.equal(
        (await prisma.qqBridgeDelivery.findUniqueOrThrow({ where: { id: task.id } })).status,
        'uncertain',
      );
      await prisma.qqBridgeDelivery.update({
        where: { id: task.id },
        data: { status: 'claimed', leaseUntil: new Date(0) },
      });
      assert.ok(await service.claim(connectorId), 'expired claimed lease must be recoverable');

      const controller = new QqBridgeConnectorController(prisma as never, {} as never, {} as never);
      const connector = await prisma.qqBridgeConnector.findUniqueOrThrow({
        where: { id: connectorId },
      });
      await controller.heartbeat({ connector } as never, {
        connected: true,
        groups: [{ id: '1', name: '群' }],
      });
      const current = await prisma.qqBridgeConnector.findUniqueOrThrow({
        where: { id: connectorId },
      });
      assert.equal(current.connected, true);
      queries.length = 0;
      await controller.heartbeat({ connector: current } as never, {
        connected: true,
        groups: [{ name: '群', id: '1' }],
      });
      assert.equal(
        queries.length,
        0,
        'JSON object key order must not trigger another heartbeat write',
      );
      await prisma.$transaction(async (tx) => {
        const setting = await tx.$queryRaw<
          Array<{ synchronous_commit: string }>
        >`SHOW synchronous_commit`;
        assert.equal(setting[0]?.synchronous_commit, 'on');
      });
    } finally {
      await prisma.qqBridgeDelivery.deleteMany({ where: { bindingId } });
      await prisma.qqBridgeBinding.deleteMany({ where: { id: bindingId } });
      await prisma.qqBridgeConnector.deleteMany({ where: { id: connectorId } });
      await prisma.group.deleteMany({ where: { id: groupId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  },
);
