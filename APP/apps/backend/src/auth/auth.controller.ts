import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestEmailCodeDto } from './dto/request-email-code.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyReminderDeviceCodeDto } from './dto/verify-reminder-device-code.dto';
import { JwtPayload } from '../common/jwt-payload.interface';
import { AuthService } from './auth.service';
import { readCookie, REFRESH_COOKIE_NAME } from '../common/auth-cookie';
import { enforceTrustedOriginForCookieAuth } from './request-origin';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUserService } from '../users/current-user.service';
import { CapabilitiesService } from '../system-config/capabilities.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LegacyAuthTelemetryInterceptor } from './legacy-auth-telemetry.interceptor';
import { BrowserOriginGuard } from './guards/browser-origin.guard';
import { BrowserSessionService } from './browser-session.service';
import { ReminderSecureTransportGuard } from './guards/reminder-secure-transport.guard';
import { CreateReminderDeviceDto } from './dto/create-reminder-device.dto';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  BrowserSessionResponseDto,
  LogoutResponseDto,
  ReminderDeviceResponseDto,
  ReminderDeviceSummaryResponseDto,
  ReminderRealtimeTicketResponseDto,
} from './dto/auth-response.dto';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('auth')
@UseInterceptors(LegacyAuthTelemetryInterceptor)
@ApiTags('auth-legacy-reminder')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly currentUserService: CurrentUserService,
    private readonly capabilitiesService: CapabilitiesService,
    private readonly browserSession: BrowserSessionService,
  ) {}

  private resolveRefreshToken(request: Request, dto?: RefreshSessionDto): string {
    const token = dto?.refreshToken?.trim() || readCookie(request, REFRESH_COOKIE_NAME);
    enforceTrustedOriginForCookieAuth(
      request,
      this.authService.getAppBaseUrl(),
      dto?.refreshToken ? undefined : token,
    );
    if (!token) {
      throw new UnauthorizedException('Missing refresh token.');
    }
    return token;
  }

  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @UseGuards(BrowserOriginGuard)
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.register(dto.email, dto.password, dto.displayName);
    this.browserSession.writeSession(response, session);
    return this.browserSession.presentSession(session);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(BrowserOriginGuard)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(dto.email, dto.password, request.ip ?? 'unknown');
    this.browserSession.writeSession(response, session);
    return this.browserSession.presentSession(session);
  }

  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('request-code')
  requestCode(@Body() dto: RequestEmailCodeDto) {
    return this.authService.requestEmailCode(dto.email);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(BrowserOriginGuard)
  @Post('verify-code')
  async verifyCode(
    @Body() dto: VerifyEmailCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.verifyEmailCode(
      dto.email,
      dto.code,
      request.ip ?? 'unknown',
    );
    this.browserSession.writeSession(response, session);
    return this.browserSession.presentSession(session);
  }

  @Get('oidc/login')
  async startOidcLogin(@Res() response: Response) {
    response.redirect(await this.authService.createOidcLoginUrl());
  }

  @Get('oidc/callback')
  async completeOidcLogin(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    if (!code && !state && !error) {
      response.type('html').send(this.authService.renderOidcImplicitRelayPage());
      return;
    }

    try {
      const result = await this.authService.completeOidcLogin(code, state, error);
      if (result.session) {
        this.browserSession.writeSession(response, result.session);
      }
      response.redirect(result.redirectUrl);
    } catch (e) {
      response
        .type('html')
        .send(
          `<html><body><h1>登录失败</h1><p>OIDC 认证失败，请重试</p><p><a href="/">返回首页</a></p></body></html>`,
        );
    }
  }

  @UseGuards(BrowserOriginGuard)
  @Post('oidc/implicit/complete')
  async completeImplicitOidcLogin(
    @Body()
    body: {
      accessToken?: string;
      idToken?: string;
      state?: string;
      error?: string;
    },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.completeOidcImplicitLogin(body);
    if (result.session) this.browserSession.writeSession(response, result.session);
    return { redirectUrl: result.redirectUrl };
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(ReminderSecureTransportGuard)
  @Post('reminder/verify-code')
  @ApiCreatedResponse({ type: ReminderDeviceResponseDto })
  verifyReminderDeviceCode(@Body() dto: VerifyReminderDeviceCodeDto, @Req() request: Request) {
    return this.authService.verifyReminderDeviceCode(
      dto.email,
      dto.code,
      dto.deviceName,
      request.ip ?? 'unknown',
    );
  }

  @UseGuards(JwtAuthGuard, BrowserOriginGuard, ReminderSecureTransportGuard)
  @Post('reminder/create-device')
  @ApiCreatedResponse({ type: ReminderDeviceResponseDto })
  createReminderDevice(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateReminderDeviceDto,
  ) {
    return this.authService.createReminderDeviceToken(request.user.sub, body.deviceName.trim());
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(ReminderSecureTransportGuard)
  @Post('reminder/realtime-ticket')
  @ApiCreatedResponse({ type: ReminderRealtimeTicketResponseDto })
  issueReminderRealtimeTicket(@Headers('x-reminder-device-token') deviceToken: string | undefined) {
    const token = deviceToken?.trim();
    if (!token || token.length > 200)
      throw new UnauthorizedException('Missing reminder device token.');
    return this.authService.issueReminderRealtimeTicket(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('reminder/devices')
  @ApiOkResponse({ type: ReminderDeviceSummaryResponseDto, isArray: true })
  listReminderDevices(@Req() request: AuthenticatedRequest) {
    return this.authService.listReminderDevices(request.user.sub);
  }

  @UseGuards(JwtAuthGuard, BrowserOriginGuard, ReminderSecureTransportGuard)
  @Delete('reminder/devices/:deviceTokenId')
  @ApiOkResponse({ type: LogoutResponseDto })
  async revokeReminderDevice(
    @Req() request: AuthenticatedRequest,
    @Param('deviceTokenId', new ParseUUIDPipe()) deviceTokenId: string,
  ) {
    await this.authService.revokeReminderDevice(request.user.sub, deviceTokenId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, BrowserOriginGuard, ReminderSecureTransportGuard)
  @Post('reminder/devices/:deviceTokenId/rotate')
  @ApiCreatedResponse({ type: ReminderDeviceResponseDto })
  rotateReminderDevice(
    @Req() request: AuthenticatedRequest,
    @Param('deviceTokenId', new ParseUUIDPipe()) deviceTokenId: string,
  ) {
    return this.authService.rotateReminderDevice(request.user.sub, deviceTokenId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('refresh')
  @ApiCreatedResponse({ type: BrowserSessionResponseDto })
  async refresh(
    @Req() request: Request,
    @Body() dto: RefreshSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.refreshSession(this.resolveRefreshToken(request, dto));
    this.browserSession.writeSession(response, session);
    return this.browserSession.presentSession(session);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('logout')
  @ApiCreatedResponse({ type: LogoutResponseDto })
  async logout(
    @Req() request: Request,
    @Body() dto: RefreshSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.revokeRefreshToken(this.resolveRefreshToken(request, dto));
    this.browserSession.clearSession(response);
    return { success: true };
  }

  // Compatibility aliases for clients that still call the legacy auth-scoped current-user APIs.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.currentUserService.getCurrentUser(request.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('capabilities')
  capabilities(@Req() request: AuthenticatedRequest) {
    return this.capabilitiesService.getCapabilities(request.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@Req() request: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.currentUserService.updateProfile(request.user.sub, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.changePassword(
      request.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
    this.browserSession.writeSession(response, session);
    let disconnected = false;
    const disconnectOldRealtimeSessions = () => {
      if (disconnected) return;
      disconnected = true;
      this.currentUserService.disconnectRealtimeSessions(request.user.sub);
    };
    response.once('finish', disconnectOldRealtimeSessions);
    response.once('close', disconnectOldRealtimeSessions);
    return this.browserSession.presentSession(session);
  }
}
