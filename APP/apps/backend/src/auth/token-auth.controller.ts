import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestEmailCodeDto } from './dto/request-email-code.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import {
  LogoutResponseDto,
  RequestCodeResponseDto,
  TokenSessionResponseDto,
} from './dto/auth-response.dto';

@Controller('auth/token')
@ApiTags('auth-token')
export class TokenAuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('register')
  @ApiCreatedResponse({ type: TokenSessionResponseDto })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.displayName);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  @ApiCreatedResponse({ type: TokenSessionResponseDto })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto.email, dto.password, request.ip ?? 'unknown');
  }

  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('request-code')
  @ApiCreatedResponse({ type: RequestCodeResponseDto })
  requestCode(@Body() dto: RequestEmailCodeDto) {
    return this.authService.requestEmailCode(dto.email);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('verify-code')
  @ApiCreatedResponse({ type: TokenSessionResponseDto })
  verifyCode(@Body() dto: VerifyEmailCodeDto, @Req() request: Request) {
    return this.authService.verifyEmailCode(dto.email, dto.code, request.ip ?? 'unknown');
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('refresh')
  @ApiCreatedResponse({ type: TokenSessionResponseDto })
  refresh(@Body() dto: RefreshSessionDto) {
    return this.authService.refreshSession(this.requireRefreshToken(dto));
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('logout')
  @ApiCreatedResponse({ type: LogoutResponseDto })
  async logout(@Body() dto: RefreshSessionDto) {
    await this.authService.revokeRefreshToken(this.requireRefreshToken(dto));
    return { success: true };
  }

  private requireRefreshToken(dto: RefreshSessionDto): string {
    const token = dto.refreshToken?.trim();
    if (!token) throw new UnauthorizedException('Missing refresh token.');
    return token;
  }
}
