import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CheckInSessionSnapshot = {
  id: string;
  userId: string;
  workDate: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
};

@Injectable()
export class CheckInCommandService {
  constructor(private readonly prisma: PrismaService) {}

  async checkIn(userId: string, workDate: string, now: Date): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const open = await transaction.checkInSession.findFirst({
          where: { userId, workDate, checkOutAt: null },
          select: { id: true },
        });
        if (open) return;
        await transaction.checkInSession.create({
          data: { userId, workDate, checkInAt: now, source: 'manual' },
        });
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) throw error;
    }
  }

  async checkOut(
    userId: string,
    workDate: string,
    now: Date,
  ): Promise<{ unchangedSessions?: CheckInSessionSnapshot[] }> {
    const sessions = await this.prisma.checkInSession.findMany({ where: { userId, workDate } });
    const open = [...sessions]
      .sort((left, right) => (right.checkInAt?.getTime() ?? 0) - (left.checkInAt?.getTime() ?? 0))
      .find((session) => session.checkInAt && !session.checkOutAt);
    if (!open) {
      if (sessions.some((session) => session.checkInAt)) return { unchangedSessions: sessions };
      throw new ForbiddenException('请先完成上班签到。');
    }
    await this.prisma.checkInSession.update({ where: { id: open.id }, data: { checkOutAt: now } });
    return {};
  }

  async resetForDevelopment(userId: string, workDate: string): Promise<number> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('开发环境专用接口不可在生产环境使用。');
    }
    const result = await this.prisma.checkInSession.deleteMany({ where: { userId, workDate } });
    return result.count;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
