import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { LoginRiskModule } from '../login-risk/login-risk.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OidcAuthService } from './oidc-auth.service';
import { PasswordAuthService } from './password-auth.service';
import { SessionTokenService } from './session-token.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { parseDurationToSeconds } from './session-duration';
import { BrowserAuthController } from './browser-auth.controller';
import { BrowserSessionService } from './browser-session.service';
import { TokenAuthController } from './token-auth.controller';
import { LegacyAuthTelemetryInterceptor } from './legacy-auth-telemetry.interceptor';
import { BrowserOriginGuard } from './guards/browser-origin.guard';
import { ReminderSecureTransportGuard } from './guards/reminder-secure-transport.guard';
import { AuthCoreModule } from './auth-core.module';

@Module({
  imports: [
    ConfigModule,
    AuthCoreModule,
    LoginRiskModule,
    PassportModule,
    PrismaModule,
    SystemConfigModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: parseDurationToSeconds(configService.getOrThrow<string>('JWT_ACCESS_TTL')),
        },
      }),
    }),
  ],
  controllers: [AuthController, BrowserAuthController, TokenAuthController],
  providers: [
    AuthService,
    OidcAuthService,
    PasswordAuthService,
    SessionTokenService,
    BrowserSessionService,
    LegacyAuthTelemetryInterceptor,
    BrowserOriginGuard,
    ReminderSecureTransportGuard,
    JwtStrategy,
  ],
  exports: [AuthService, AuthCoreModule, ReminderSecureTransportGuard],
})
export class AuthModule {}
