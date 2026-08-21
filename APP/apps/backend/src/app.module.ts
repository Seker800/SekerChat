import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AdminArtifactsModule } from './admin-artifacts/admin-artifacts.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { AvatarsModule } from './avatars/avatars.module';
import { BotsModule } from './bots/bots.module';
import { EnvironmentConfigModule } from './config/environment-config.module';
import { DmModule } from './dm/dm.module';
import { FilesModule } from './files/files.module';
import { FileSharesModule } from './file-shares/file-shares.module';
import { GroupsModule } from './groups/groups.module';
import { LoginRiskModule } from './login-risk/login-risk.module';
import { MessagesModule } from './messages/messages.module';
import { RetentionModule } from './messages/retention.module';
import { TasksModule } from './tasks/tasks.module';
import { PrismaModule } from './prisma/prisma.module';
import { OpsModule } from './ops/ops.module';
import { OutboxModule } from './outbox/outbox.module';
import { RealtimeController } from './realtime/realtime.controller';
import { RealtimeModule } from './realtime/realtime.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { PresenceLogModule } from './presence-log/presence-log.module';
import { UsersModule } from './users/users.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AttendanceTrackingInterceptor } from './common/attendance-tracking.interceptor';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { UploadsModule } from './uploads/uploads.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { HealthReadinessService } from './health-readiness.service';
import { AlbumModule } from './album/album.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 1_000, limit: 1_000 }]),
    EnvironmentConfigModule,
    PrismaModule,
    AdminArtifactsModule,
    OpsModule,
    OutboxModule,
    AuthModule,
    ArtifactsModule,
    AvatarsModule,
    DmModule,
    GroupsModule,
    FilesModule,
    FileSharesModule,
    LoginRiskModule,
    MessagesModule,
    RetentionModule,
    BotsModule,
    UploadsModule,
    TasksModule,
    RealtimeModule,
    PresenceLogModule,
    AttendanceModule,
    SystemConfigModule,
    UsersModule,
    WorkspaceModule,
    SubscriptionsModule,
    AlbumModule,
  ],
  controllers: [AppController, RealtimeController],
  providers: [
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
    AttendanceTrackingInterceptor,
    RequestLoggingInterceptor,
    HealthReadinessService,
  ],
})
export class AppModule {}
