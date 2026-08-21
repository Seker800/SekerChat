import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderDeviceAuthService } from './reminder-device-auth.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL consumes a realtime ticket exactly once under concurrency', {
  skip: !testDatabaseUrl,
}, async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new ReminderDeviceAuthService(prisma, {} as never);
  try {
    const user = await prisma.user.create({
      data: { email: 'ticket-integration@example.com', displayName: 'Ticket Test' },
    });
    const session = await service.createReminderDeviceToken(user.id, 'integration-device');
    const issued = await service.issueRealtimeTicket(session.deviceToken);

    const outcomes = await Promise.allSettled([
      service.consumeRealtimeTicket(issued.ticket),
      service.consumeRealtimeTicket(issued.ticket),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  } finally {
    await prisma.user.deleteMany({ where: { email: 'ticket-integration@example.com' } });
    await prisma.$disconnect();
  }
});
