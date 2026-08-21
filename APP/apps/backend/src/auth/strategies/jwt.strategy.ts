import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { ACCESS_COOKIE_NAME, parseCookieHeader } from '../../common/auth-cookie';
import { JwtPayload } from '../../common/jwt-payload.interface';
import { AuthUserService } from '../auth-user.service';
import { enforceTrustedOriginForCookieAuth } from '../request-origin';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authUserService: AuthUserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
          if (token) {
            return token;
          }

          const cookieToken = parseCookieHeader(request.headers.cookie)[ACCESS_COOKIE_NAME]?.trim();
          enforceTrustedOriginForCookieAuth(
            request,
            configService.getOrThrow<string>('APP_BASE_URL'),
            cookieToken,
          );
          return cookieToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    return this.authUserService.resolveValidatedUser(payload);
  }
}
