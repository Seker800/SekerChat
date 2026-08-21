import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectStorageGateway } from './files/object-storage.gateway';
import { PrismaService } from './prisma/prisma.service';

const READINESS_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly objectStorage: ObjectStorageGateway,
  ) {}

  async check(): Promise<{ status: 'ready' }> {
    this.assertRequiredConfig();
    try {
      await Promise.all([
        this.withTimeout(this.prisma.$queryRaw`SELECT 1`),
        this.withTimeout(this.objectStorage.checkReady()),
      ]);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }

  private assertRequiredConfig(): void {
    for (const key of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'S3_ENDPOINT', 'S3_BUCKET']) {
      if (!this.config.get<string>(key)?.trim()) {
        throw new ServiceUnavailableException({ status: 'not_ready', reason: `missing_${key}` });
      }
    }
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Readiness check timed out.')),
        READINESS_TIMEOUT_MS,
      );
      operation.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
