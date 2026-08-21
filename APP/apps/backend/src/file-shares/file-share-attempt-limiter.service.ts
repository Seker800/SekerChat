import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ATTEMPT_WINDOW_MS = 15 * 60 * 1_000;
const ATTEMPT_FAILURE_THRESHOLD = 5;
const CLIENT_FAILURE_THRESHOLD = 30;
const BASE_LOCKOUT_MS = 15 * 60 * 1_000;
const MAX_LOCKOUT_LEVEL = 7;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type FileShareAttemptKey = {
  shareTokenHash: string;
  clientFingerprint: string;
};

type FailureState = {
  failureCount: number;
  lockoutLevel: number;
  blockedUntil: Date | null;
  lastFailedAt: Date;
};

type ClientFailureState = FailureState & {
  windowStartedAt: Date;
};

function nextFailureState(
  current: FailureState | null,
  threshold: number,
  now: Date,
): FailureState {
  const withinWindow = current
    ? now.getTime() - current.lastFailedAt.getTime() < ATTEMPT_WINDOW_MS
    : false;
  const failureCount = withinWindow ? current!.failureCount + 1 : 1;
  const previousLevel = current?.lockoutLevel ?? 0;

  if (failureCount < threshold) {
    return {
      failureCount,
      lockoutLevel: previousLevel,
      blockedUntil: null,
      lastFailedAt: now,
    };
  }

  const lockoutLevel = Math.min(previousLevel + 1, MAX_LOCKOUT_LEVEL);
  return {
    failureCount,
    lockoutLevel,
    blockedUntil: new Date(now.getTime() + BASE_LOCKOUT_MS * 2 ** (lockoutLevel - 1)),
    lastFailedAt: now,
  };
}

function nextClientFailureState(
  current: ClientFailureState | null,
  now: Date,
): ClientFailureState {
  const withinWindow = current
    ? now.getTime() - current.windowStartedAt.getTime() < ATTEMPT_WINDOW_MS
    : false;
  const base = nextFailureState(
    withinWindow ? current : null,
    CLIENT_FAILURE_THRESHOLD,
    now,
  );
  return {
    ...base,
    lockoutLevel: base.lockoutLevel || current?.lockoutLevel || 0,
    windowStartedAt: withinWindow ? current!.windowStartedAt : now,
  };
}

@Injectable()
export class FileShareAttemptLimiterService {
  constructor(private readonly prismaService: PrismaService) {}

  async assertAllowed(key: FileShareAttemptKey, now = new Date()): Promise<void> {
    const [attempt, clientRisk] = await Promise.all([
      this.prismaService.fileShareUnlockAttempt.findUnique({
        where: {
          shareTokenHash_clientFingerprint: key,
        },
        select: { blockedUntil: true },
      }),
      this.prismaService.fileShareClientRisk.findUnique({
        where: { clientFingerprint: key.clientFingerprint },
        select: { blockedUntil: true },
      }),
    ]);

    if ([attempt?.blockedUntil, clientRisk?.blockedUntil].some((until) => until && until > now)) {
      throw new HttpException('尝试次数过多，请稍后再试。', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async recordFailure(key: FileShareAttemptKey, now = new Date()): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      await this.acquireLock(tx, `file-share-client:${key.clientFingerprint}`);
      await this.acquireLock(tx, `file-share-attempt:${key.shareTokenHash}:${key.clientFingerprint}`);

      const [attempt, clientRisk] = await Promise.all([
        tx.fileShareUnlockAttempt.findUnique({
          where: { shareTokenHash_clientFingerprint: key },
        }),
        tx.fileShareClientRisk.findUnique({
          where: { clientFingerprint: key.clientFingerprint },
        }),
      ]);
      const nextAttempt = nextFailureState(attempt, ATTEMPT_FAILURE_THRESHOLD, now);
      const nextClientRisk = nextClientFailureState(clientRisk, now);

      await tx.fileShareUnlockAttempt.upsert({
        where: { shareTokenHash_clientFingerprint: key },
        create: { ...key, ...nextAttempt },
        update: nextAttempt,
      });
      await tx.fileShareClientRisk.upsert({
        where: { clientFingerprint: key.clientFingerprint },
        create: {
          clientFingerprint: key.clientFingerprint,
          ...nextClientRisk,
        },
        update: nextClientRisk,
      });
    });
  }

  async reset(key: FileShareAttemptKey): Promise<void> {
    await this.prismaService.fileShareUnlockAttempt.deleteMany({ where: key });
  }

  @Cron('17 4 * * *')
  async deleteExpiredState(now = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - RETENTION_MS);
    await this.prismaService.$transaction([
      this.prismaService.fileShareUnlockAttempt.deleteMany({
        where: {
          updatedAt: { lt: cutoff },
          OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
        },
      }),
      this.prismaService.fileShareClientRisk.deleteMany({
        where: {
          updatedAt: { lt: cutoff },
          OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
        },
      }),
    ]);
  }

  private async acquireLock(tx: Prisma.TransactionClient, value: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${value}, 0))`;
  }
}
