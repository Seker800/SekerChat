import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NOTIFICATION_DISABLED_UNTIL_ISO } from '@sekerchat/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UserRealtimeGateway } from '../realtime/user-realtime-gateway.service';
import { DndConfigService } from '../system-config/dnd-config.service';

const TZ = 'Asia/Shanghai';
const NOTIFICATION_DISABLED_UNTIL = new Date(NOTIFICATION_DISABLED_UNTIL_ISO);

function shanghaiNow(): { date: string; time: string; dayOfWeek: number } {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const date = dateFmt.format(new Date()); // "2026-05-15"
  const time = timeFmt.format(new Date()); // "14:30" or "14:30:00"

  // Use UTC methods on a date string with Z suffix to get Shanghai day-of-week
  const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay();

  return { date, time, dayOfWeek };
}

@Injectable()
export class DndSchedulerService {
  private readonly logger = new Logger(DndSchedulerService.name);
  private lastTriggers = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dndConfigService: DndConfigService,
    private readonly realtime: UserRealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'dnd-scheduler',
    timeZone: TZ,
    waitForCompletion: true,
  })
  async tick() {
    const { date: today, time, dayOfWeek } = shanghaiNow();

    const config = await this.dndConfigService.getRawConfig();

    const daysOfWeek = (config['dndDaysOfWeek'] || '1,2,3,4,5')
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
    if (!daysOfWeek.includes(dayOfWeek)) {
      return;
    }

    const points: Array<{ key: string; dndUntil: Date | null }> = [
      { key: 'dndOn1', dndUntil: null },
      { key: 'dndOff1', dndUntil: NOTIFICATION_DISABLED_UNTIL },
      { key: 'dndOn2', dndUntil: null },
      { key: 'dndOff2', dndUntil: NOTIFICATION_DISABLED_UNTIL },
    ];

    for (const point of points) {
      const scheduled = config[point.key];
      if (!scheduled) continue;

      // Use >= instead of === so a trigger missed due to server downtime
      // fires on the next cron tick (same day), not lost forever.
      if (time >= scheduled && this.lastTriggers.get(point.key) !== today) {
        this.lastTriggers.set(point.key, today);
        const action = point.dndUntil === null ? 'auto-on' : 'auto-off';
        this.logger.log(`DnD ${action} at ${scheduled} (${point.key})`);

        await this.prisma.user.updateMany({
          where: { isBot: false, disabledAt: null },
          data: { dndUntil: point.dndUntil },
        });
        this.broadcastToAllOnline(point.dndUntil);
      }
    }
  }

  private broadcastToAllOnline(dndUntil: Date | null) {
    const onlineIds = this.realtime.getOnlineUserIds();
    for (const userId of onlineIds) {
      this.realtime.publishDndChanged(userId, dndUntil);
    }
  }
}
