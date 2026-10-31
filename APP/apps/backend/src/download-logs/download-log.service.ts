import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { resolve } from 'node:path';
import { DownloadLogStore } from './download-log-store';

@Injectable()
export class DownloadLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DownloadLogService.name);
  private readonly store: DownloadLogStore;

  constructor(config: ConfigService) {
    this.store = new DownloadLogStore(
      resolve(config.get<string>('DOWNLOAD_LOG_DIR') || '.local/download-logs'),
      {
        warn: () =>
          this.logger.warn(
            'download_log_records_dropped: journal unavailable or capacity exceeded',
          ),
      },
    );
  }

  onModuleInit(): void {
    this.cleanup();
  }
  @Cron('0 15 0 * * *', { timeZone: 'UTC' })
  cleanup(): void {
    this.store.cleanup();
  }
  onModuleDestroy(): Promise<void> {
    return this.store.flush();
  }
  record(record: Record<string, unknown>): void {
    this.store.record(record);
  }
}
