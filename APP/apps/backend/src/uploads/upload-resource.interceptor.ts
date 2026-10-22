import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { defer, finalize, from, mergeMap, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOAD_SESSION_RESUME_WINDOW_MS } from '@sekerchat/shared';

const LIMITS: Record<string, { perUser: number; total: number }> = {
  initiateUpload: { perUser: 1, total: 8 },
  uploadPart: { perUser: 12, total: 24 },
  completeUpload: { perUser: 1, total: 2 },
};

@Injectable()
export class UploadResourceInterceptor implements NestInterceptor {
  // Production currently has one active backend. Durable session usage is read
  // from PostgreSQL; these permits only bound in-flight work in this instance.
  private readonly active = new Map<string, number>();
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return defer(() => {
      const phase = context.getHandler().name;
      const limits = LIMITS[phase];
      if (!limits) return next.handle();
      const request = context.switchToHttp().getRequest<{ user: { sub: string }; body?: { size?: number } }>();
      const key = `${phase}:${request.user.sub}`;
      const total = this.active.get(phase) ?? 0;
      const user = this.active.get(key) ?? 0;
      if (total >= limits.total || user >= limits.perUser) throw new HttpException('上传处理繁忙，请稍后重试。', 429);
      this.active.set(phase, total + 1);
      this.active.set(key, user + 1);
      const admission = phase === 'initiateUpload'
        ? this.assertSessionBudget(request.user.sub, request.body?.size)
        : Promise.resolve();
      return from(admission).pipe(mergeMap(() => next.handle()), finalize(() => {
        for (const entry of [phase, key]) {
          const remaining = (this.active.get(entry) ?? 1) - 1;
          if (remaining) this.active.set(entry, remaining); else this.active.delete(entry);
        }
      }));
    });
  }

  private async assertSessionBudget(userId: string, size?: number) {
    const usage = await this.prisma.uploadSession.aggregate({
      where: { uploaderId: userId, createdAt: { gt: new Date(Date.now() - UPLOAD_SESSION_RESUME_WINDOW_MS) },
        OR: [{ status: { in: ['INITIATED', 'ASSEMBLED', 'FINALIZING'] } }, { status: 'FAILED', finalizationAttempts: { lt: 10 } }] },
      _count: true, _sum: { size: true },
    });
    const requested = Number.isSafeInteger(size) && size! > 0 ? BigInt(size!) : 0n;
    if (usage._count >= 8 || (usage._sum.size ?? 0n) + requested > 20n * 1024n ** 3n) {
      throw new HttpException('未完成上传会话过多或预留容量超过 20GB，请先完成或取消已有上传。', 429);
    }
  }
}
