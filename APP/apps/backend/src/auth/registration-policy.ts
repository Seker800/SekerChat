import { ForbiddenException } from '@nestjs/common';
import type { RegistrationConfig } from '../system-config/registration-config.service';

export function assertRegistrationAllowed(email: string, config: RegistrationConfig, fallbackWhitelist?: string) {
  const whitelist = config.emailWhitelist || fallbackWhitelist;
  if (whitelist && !whitelist.split(/[\n,]+/).map((value) => value.trim().toLowerCase()).filter(Boolean).includes(email)) {
    throw new ForbiddenException('该邮箱不在注册白名单中');
  }
  if (config.registrationOpen !== 'true') throw new ForbiddenException('注册已关闭，请联系管理员');
}
