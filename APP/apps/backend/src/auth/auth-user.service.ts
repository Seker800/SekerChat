import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { resolveActorType } from '../common/bot-identity';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/jwt-payload.interface';

@Injectable()
export class AuthUserService {
  constructor(private readonly prismaService: PrismaService) {}

  async resolveValidatedUser(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
      select: {
        email: true,
        displayName: true,
        role: true,
        isBot: true,
        disabledAt: true,
        mustChangePassword: true,
        authVersion: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (user.disabledAt) {
      throw new ForbiddenException('该账号已停用，请联系管理员');
    }

    if ((payload.authVersion ?? 0) !== user.authVersion) {
      throw new UnauthorizedException('登录状态已失效，请重新登录。');
    }

    return {
      sub: payload.sub,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      actorType: resolveActorType(user),
      mustChangePassword: user.mustChangePassword,
      authVersion: user.authVersion,
      jti: payload.jti,
    };
  }
}
