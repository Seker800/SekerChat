import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailCodeAuthService } from './email-code-auth.service';
import type {
  ReminderDevicePrincipal,
  ReminderDeviceSession,
  ReminderRealtimeTicket,
} from './reminder-device-auth.types';

const REALTIME_TICKET_TTL_MS = 60_000;
const TICKET_RETENTION_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class ReminderDeviceAuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailCodeAuthService: EmailCodeAuthService,
  ) {}

  async verifyReminderDeviceCode(
    email: string,
    code: string,
    deviceName: string,
    ip: string,
  ): Promise<ReminderDeviceSession> {
    const user = await this.emailCodeAuthService.consumeEmailCode(email, code, ip);
    return this.createReminderDeviceToken(user.id, deviceName, user);
  }

  async createReminderDeviceToken(
    userId: string,
    deviceName: string,
    knownUser?: ReminderDeviceSession['user'],
  ): Promise<ReminderDeviceSession> {
    const normalizedDeviceName = this.normalizeDeviceName(deviceName);
    const deviceToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(deviceToken);
    const user = knownUser ?? await this.prismaService.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, role: true },
    });

    const reminderDevice = await this.prismaService.$transaction(async (tx) => {
      await tx.reminderDeviceToken.updateMany({
        where: { userId, deviceName: normalizedDeviceName, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.reminderDeviceToken.create({
        data: { userId, deviceName: normalizedDeviceName, tokenHash },
      });
    });

    return {
      deviceToken,
      deviceTokenId: reminderDevice.id,
      deviceName: reminderDevice.deviceName,
      user,
    };
  }

  async authenticateDeviceToken(
    reminderDeviceToken: string,
    now = new Date(),
  ): Promise<ReminderDevicePrincipal> {
    const token = reminderDeviceToken.trim();
    if (!token || token.length > 200) {
      throw new UnauthorizedException('Missing reminder device token.');
    }

    const reminderDevice = await this.prismaService.reminderDeviceToken.findFirst({
      where: { tokenHash: this.hashToken(token), revokedAt: null },
      select: {
        id: true,
        userId: true,
        user: { select: { email: true, displayName: true, dndUntil: true } },
      },
    });
    if (!reminderDevice) throw new UnauthorizedException('Invalid reminder device token.');

    const touched = await this.prismaService.reminderDeviceToken.updateMany({
      where: { id: reminderDevice.id, revokedAt: null },
      data: { lastUsedAt: now },
    });
    if (touched.count !== 1) throw new UnauthorizedException('Invalid reminder device token.');
    return this.toPrincipal(reminderDevice);
  }

  async issueRealtimeTicket(
    reminderDeviceToken: string,
    now = new Date(),
  ): Promise<ReminderRealtimeTicket> {
    const principal = await this.authenticateDeviceToken(reminderDeviceToken, now);
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + REALTIME_TICKET_TTL_MS);
    await this.prismaService.reminderRealtimeTicket.create({
      data: {
        tokenHash: this.hashToken(ticket),
        expiresAt,
        reminderDeviceTokenId: principal.deviceTokenId,
      },
    });
    return { ticket, expiresAt };
  }

  async consumeRealtimeTicket(ticket: string, now = new Date()): Promise<ReminderDevicePrincipal> {
    const token = ticket.trim();
    if (!token || token.length > 200) throw new UnauthorizedException('Missing realtime ticket.');
    const tokenHash = this.hashToken(token);

    return this.prismaService.$transaction(async (tx) => {
      const consumed = await tx.reminderRealtimeTicket.updateMany({
        where: {
          tokenHash,
          consumedAt: null,
          expiresAt: { gt: now },
          reminderDeviceToken: { revokedAt: null },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Invalid realtime ticket.');

      const stored = await tx.reminderRealtimeTicket.findUnique({
        where: { tokenHash },
        select: {
          reminderDeviceToken: {
            select: {
              id: true,
              userId: true,
              user: { select: { email: true, displayName: true, dndUntil: true } },
            },
          },
        },
      });
      if (!stored) throw new UnauthorizedException('Invalid realtime ticket.');
      return this.toPrincipal(stored.reminderDeviceToken);
    });
  }

  async listDevices(userId: string) {
    return this.prismaService.reminderDeviceToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
  }

  async revokeDevice(userId: string, deviceTokenId: string, now = new Date()): Promise<void> {
    const revoked = await this.prismaService.reminderDeviceToken.updateMany({
      where: { id: deviceTokenId, userId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) throw new NotFoundException('Reminder device not found.');
  }

  async rotateDevice(userId: string, deviceTokenId: string): Promise<ReminderDeviceSession> {
    const device = await this.prismaService.reminderDeviceToken.findFirst({
      where: { id: deviceTokenId, userId, revokedAt: null },
      select: { deviceName: true },
    });
    if (!device) throw new NotFoundException('Reminder device not found.');
    return this.createReminderDeviceToken(userId, device.deviceName);
  }

  @Cron('43 3 * * *')
  async deleteExpiredTickets(now = new Date()): Promise<void> {
    await this.prismaService.reminderRealtimeTicket.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - TICKET_RETENTION_MS) } },
    });
  }

  private normalizeDeviceName(deviceName: string): string {
    const normalized = deviceName.trim();
    if (!normalized) throw new BadRequestException('Device name is required.');
    return normalized;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPrincipal(device: {
    id: string;
    userId: string;
    user: { email: string; displayName: string | null; dndUntil: Date | null };
  }): ReminderDevicePrincipal {
    return {
      deviceTokenId: device.id,
      userId: device.userId,
      email: device.user.email,
      displayName: device.user.displayName,
      dndUntil: device.user.dndUntil,
    };
  }
}
