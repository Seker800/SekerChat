import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailCodeAuthService } from './email-code-auth.service';
import { OidcAuthService } from './oidc-auth.service';
import { PasswordAuthService } from './password-auth.service';
import { ReminderDeviceAuthService } from './reminder-device-auth.service';
import { SessionTokenService } from './session-token.service';
import type { ReminderDeviceSession } from './reminder-device-auth.types';
import type { AuthSession } from './auth-session.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailCodeAuthService: EmailCodeAuthService,
    private readonly oidcAuthService: OidcAuthService,
    private readonly passwordAuthService: PasswordAuthService,
    private readonly reminderDeviceAuthService: ReminderDeviceAuthService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async requestEmailCode(email: string): Promise<{ deliveryHint: string }> {
    return this.emailCodeAuthService.requestEmailCode(email);
  }

  getAppBaseUrl(): string {
    return this.configService.getOrThrow<string>('APP_BASE_URL');
  }

  async register(email: string, password: string, displayName?: string): Promise<AuthSession> {
    const user = await this.passwordAuthService.register(email, password, displayName);
    return this.sessionTokenService.createSession(user);
  }

  async login(email: string, password: string, ip: string): Promise<AuthSession> {
    const user = await this.passwordAuthService.login(email, password, ip);
    return this.sessionTokenService.createSession(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthSession> {
    const user = await this.passwordAuthService.changePassword(userId, currentPassword, newPassword);
    return this.sessionTokenService.createSession(user, undefined, true);
  }

  async verifyEmailCode(email: string, code: string, ip: string): Promise<AuthSession> {
    const user = await this.emailCodeAuthService.consumeEmailCode(email, code, ip);
    return this.sessionTokenService.createSession(user);
  }

  async createOidcLoginUrl(): Promise<string> {
    return this.oidcAuthService.createOidcLoginUrl();
  }

  renderOidcImplicitRelayPage(): string {
    return this.oidcAuthService.renderOidcImplicitRelayPage();
  }

  async completeOidcLogin(
    code: string | undefined,
    state: string | undefined,
    oidcError: string | undefined,
  ): Promise<{ redirectUrl: string; session?: AuthSession }> {
    return this.oidcAuthService.completeOidcLogin(code, state, oidcError);
  }

  async completeOidcImplicitLogin(input: {
    accessToken?: string;
    idToken?: string;
    state?: string;
    error?: string;
  }): Promise<{ redirectUrl: string; session?: AuthSession }> {
    return this.oidcAuthService.completeOidcImplicitLogin(input);
  }

  async verifyReminderDeviceCode(
    email: string,
    code: string,
    deviceName: string,
    ip: string,
  ): Promise<ReminderDeviceSession> {
    return this.reminderDeviceAuthService.verifyReminderDeviceCode(email, code, deviceName, ip);
  }

  async createReminderDeviceToken(userId: string, deviceName: string): Promise<ReminderDeviceSession> {
    return this.reminderDeviceAuthService.createReminderDeviceToken(userId, deviceName);
  }

  issueReminderRealtimeTicket(deviceToken: string) {
    return this.reminderDeviceAuthService.issueRealtimeTicket(deviceToken);
  }

  listReminderDevices(userId: string) {
    return this.reminderDeviceAuthService.listDevices(userId);
  }

  async revokeReminderDevice(userId: string, deviceTokenId: string): Promise<void> {
    await this.reminderDeviceAuthService.revokeDevice(userId, deviceTokenId);
  }

  rotateReminderDevice(userId: string, deviceTokenId: string): Promise<ReminderDeviceSession> {
    return this.reminderDeviceAuthService.rotateDevice(userId, deviceTokenId);
  }

  async refreshSession(refreshToken: string): Promise<AuthSession> {
    return this.sessionTokenService.refreshSession(refreshToken);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.sessionTokenService.revokeRefreshToken(refreshToken);
  }
}
