import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthCoreModule } from '../auth/auth-core.module';
import { PresenceLogModule } from '../presence-log/presence-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupRealtimePublisher } from './group-realtime-publisher.service';
import { RealtimeService } from './realtime.service';
import { ConnectionAuthenticator } from './connection-authenticator.service';
import { ConnectionRegistry } from './connection-registry.service';
import { GroupAudienceResolver } from './group-audience-resolver.service';
import { RealtimeEventPublisher } from './realtime-event-publisher.service';
import { WsServerAdapter } from './ws-server-adapter.service';
import { PresenceCoordinator } from './presence-coordinator.service';
import { MessageRealtimePublisher } from './message-realtime-publisher.service';
import { UserRealtimeGateway } from './user-realtime-gateway.service';

@Module({
  imports: [
    AuthCoreModule,
    ConfigModule,
    PrismaModule,
    PresenceLogModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  providers: [
    ConnectionRegistry,
    ConnectionAuthenticator,
    GroupAudienceResolver,
    RealtimeEventPublisher,
    WsServerAdapter,
    PresenceCoordinator,
    RealtimeService,
    GroupRealtimePublisher,
    MessageRealtimePublisher,
    UserRealtimeGateway,
  ],
  exports: [RealtimeService, GroupRealtimePublisher, MessageRealtimePublisher, UserRealtimeGateway],
})
export class RealtimeModule {}
