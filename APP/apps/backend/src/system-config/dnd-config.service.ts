import { Injectable } from '@nestjs/common';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigStoreService } from './system-config-store.service';

const DND_DEFAULTS = {
  dndOn1: '08:30',
  dndOff1: '12:00',
  dndOn2: '13:30',
  dndOff2: '18:00',
};

const DND_CONFIG_KEYS = ['dndOn1', 'dndOff1', 'dndOn2', 'dndOff2', 'dndDaysOfWeek'] as const;

@Injectable()
export class DndConfigService {
  constructor(private readonly store: SystemConfigStoreService) {}

  async getRawConfig(): Promise<Record<string, string>> {
    return this.store.getValues([...DND_CONFIG_KEYS]);
  }

  async updateFromDto(dto: UpdateSystemConfigDto): Promise<void> {
    await this.store.upsertMany({
      dndOn1: dto.dndOn1,
      dndOff1: dto.dndOff1,
      dndOn2: dto.dndOn2,
      dndOff2: dto.dndOff2,
      dndDaysOfWeek: dto.dndDaysOfWeek,
    });
  }

  async ensureDefaults(): Promise<void> {
    const current = await this.getRawConfig();

    await this.store.upsertMany({
      dndOn1: current.dndOn1 ?? DND_DEFAULTS.dndOn1,
      dndOff1: current.dndOff1 ?? DND_DEFAULTS.dndOff1,
      dndOn2: current.dndOn2 ?? DND_DEFAULTS.dndOn2,
      dndOff2: current.dndOff2 ?? DND_DEFAULTS.dndOff2,
    });
  }
}
