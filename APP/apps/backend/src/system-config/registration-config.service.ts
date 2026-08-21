import { Injectable } from '@nestjs/common';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigStoreService } from './system-config-store.service';

export type RegistrationConfig = {
  registrationOpen?: string;
  emailWhitelist?: string;
};

@Injectable()
export class RegistrationConfigService {
  constructor(private readonly store: SystemConfigStoreService) {}

  async getRegistrationConfig(): Promise<RegistrationConfig> {
    return this.store.getValues(['registrationOpen', 'emailWhitelist']);
  }

  async updateFromDto(dto: UpdateSystemConfigDto): Promise<void> {
    await this.store.upsertMany({
      registrationOpen: dto.registrationOpen,
      emailWhitelist: dto.emailWhitelist,
    });
  }
}
