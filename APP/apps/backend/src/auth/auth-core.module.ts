import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoginRiskModule } from '../login-risk/login-risk.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthUserService } from './auth-user.service';
import { EmailCodeAuthService } from './email-code-auth.service';
import { ReminderDeviceAuthService } from './reminder-device-auth.service';

@Module({
  imports: [ConfigModule, LoginRiskModule, PrismaModule],
  providers: [AuthUserService, EmailCodeAuthService, ReminderDeviceAuthService],
  exports: [AuthUserService, EmailCodeAuthService, ReminderDeviceAuthService],
})
export class AuthCoreModule {}
