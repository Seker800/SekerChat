import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DownloadLogService } from './download-log.service';
import { DownloadLoggingInterceptor } from './download-logging.interceptor';
import { DownloadLogsController } from './download-logs.controller';

@Module({
  imports: [ConfigModule],
  controllers: [DownloadLogsController],
  providers: [
    DownloadLogService,
    { provide: APP_INTERCEPTOR, useClass: DownloadLoggingInterceptor },
  ],
})
export class DownloadLogsModule {}
