import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PresenceLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    userId: string,
    email: string,
    event: 'online' | 'offline' | 'dnd_on' | 'dnd_off',
    options?: {
      displayName?: string | null;
      isOnline?: boolean;
      isDnd?: boolean;
    },
  ) {
    return this.prisma.presenceLog.create({
      data: {
        userId,
        email,
        event,
        displayName: options?.displayName ?? null,
        isOnline: options?.isOnline ?? event === 'online',
        isDnd: options?.isDnd ?? false,
      },
    });
  }

  async list(options: {
    limit?: number;
    offset?: number;
    userId?: string;
    event?: string;
  }) {
    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;
    const where: Record<string, unknown> = {};
    if (options.userId) where.userId = options.userId;
    if (options.event) where.event = options.event;

    const [items, total] = await Promise.all([
      this.prisma.presenceLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.presenceLog.count({ where }),
    ]);

    return { items, total, limit, offset };
  }
}
