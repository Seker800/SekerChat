import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileShareAttemptLimiterService } from './file-share-attempt-limiter.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL keeps file-share lockouts across backend process lifetimes', {
  skip: !testDatabaseUrl,
}, async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  const key = {
    shareTokenHash: 'integration-share-hash',
    clientFingerprint: 'integration-client-hmac',
  };
  const now = new Date('2026-08-11T10:00:00.000Z');
  const firstPrisma = new PrismaService();

  try {
    await firstPrisma.$connect();
    const firstInstance = new FileShareAttemptLimiterService(firstPrisma);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await firstInstance.recordFailure(key, now);
    }
  } finally {
    await firstPrisma.$disconnect();
  }

  const restartedPrisma = new PrismaService();
  try {
    await restartedPrisma.$connect();
    const restartedInstance = new FileShareAttemptLimiterService(restartedPrisma);
    await assert.rejects(() => restartedInstance.assertAllowed(key, now), HttpException);
  } finally {
    await restartedPrisma.fileShareUnlockAttempt.deleteMany({
      where: { shareTokenHash: key.shareTokenHash },
    });
    await restartedPrisma.fileShareClientRisk.deleteMany({
      where: { clientFingerprint: key.clientFingerprint },
    });
    await restartedPrisma.$disconnect();
  }
});
