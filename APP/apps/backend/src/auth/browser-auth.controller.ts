import { Body, Controller, Get, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { JwtPayload } from '../common/jwt-payload.interface';
import { CurrentUserService } from '../users/current-user.service';
import { AuthService } from './auth.service';
import { BrowserSessionService } from './browser-session.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestEmailCodeDto } from './dto/request-email-code.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { renderOidcRelayScript } from './oidc-relay';
import { BrowserOriginGuard } from './guards/browser-origin.guard';
import { ApiCreatedResponse, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  BrowserSessionResponseDto,
  LogoutResponseDto,
  RequestCodeResponseDto,
} from './dto/auth-response.dto';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('auth/browser')
@UseGuards(BrowserOriginGuard)
@ApiTags('auth-browser')
export class BrowserAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly browserSession: BrowserSessionService,
    private readonly currentUserService: CurrentUserService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('register')
  @ApiCreatedResponse({ type: BrowserSessionResponseDto })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.register(dto.email, dto.password, dto.displayName);
    this.browserSession.writeSession(response, session);
    return this.browserSession.presentSession(session);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  @ApiCreatedResponse({ type: BrowserSessionResponseDto })
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
  @ApiCreatedResponse({ type: RequestCodeResponseDto })
  requestCode(@Body() dto: RequestEmailCodeDto) {
    return this.authService.requestEmailCode(dto.email);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('verify-code')
  @ApiCreatedResponse({ type: BrowserSessionResponseDto })
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
  @ApiExcludeEndpoint()
  async startOidcLogin(@Res() response: Response) {
    response.redirect(await this.authService.createOidcLoginUrl());
  }

  @Get('oidc/callback')
  @ApiExcludeEndpoint()
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
      if (result.session) this.browserSession.writeSession(response, result.session);
      response.redirect(result.redirectUrl);
    } catch {
      response
        .type('html')
        .send(
          '<html><body><h1>登录失败</h1><p>OIDC 认证失败，请重试</p><p><a href="/">返回首页</a></p></body></html>',
        );
    }
  }

  @Post('oidc/implicit/complete')
  @ApiExcludeEndpoint()
  async completeImplicitOidcLogin(
    @Body() body: { accessToken?: string; idToken?: string; state?: string; error?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.completeOidcImplicitLogin(body);
    if (result.session) this.browserSession.writeSession(response, result.session);
    return { redirectUrl: result.redirectUrl };
  }

  @Get('oidc/implicit/relay.js')
  @ApiExcludeEndpoint()
  oidcImplicitRelayScript(@Res() response: Response) {
    response.type('application/javascript').send(renderOidcRelayScript());
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('refresh')
  @ApiCreatedResponse({ type: BrowserSessionResponseDto })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.refreshSession(
      this.browserSession.resolveRefreshCookie(request),
    );
    this.browserSession.writeSession(response, session);
    return this.browserSession.presentSession(session);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('logout')
  @ApiCreatedResponse({ type: LogoutResponseDto })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.revokeRefreshToken(this.browserSession.resolveRefreshCookie(request));
    this.browserSession.clearSession(response);
    return { success: true };
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  @ApiOkResponse({ type: BrowserSessionResponseDto })
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
