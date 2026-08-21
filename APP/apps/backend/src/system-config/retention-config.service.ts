import { Injectable } from '@nestjs/common';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigStoreService } from './system-config-store.service';

export type RetentionConfig = {
  textRetentionDays: number;
  imageRetentionDays: number;
  imageRetentionSizeGB: number;
  fileRetentionDays: number;
  fileRetentionSizeGB: number;
  schedule: 'daily' | 'weekly' | 'manual';
};

@Injectable()
export class RetentionConfigService {
  constructor(private readonly store: SystemConfigStoreService) {}

  async getPolicy(): Promise<RetentionConfig> {
    return this.normalizeConfig(
      await this.store.getValues([
        'messageRetentionDays',
        'messageRetentionSizeGB',
        'textRetentionDays',
        'imageRetentionDays',
        'imageRetentionSizeGB',
        'fileRetentionDays',
        'fileRetentionSizeGB',
        'retentionSchedule',
      ]),
    );
  }

  async updateFromDto(dto: UpdateSystemConfigDto): Promise<void> {
    await this.store.upsertMany({
      messageRetentionDays:
        dto.messageRetentionDays !== undefined ? String(dto.messageRetentionDays) : undefined,
      messageRetentionSizeGB:
        dto.messageRetentionSizeGB !== undefined ? String(dto.messageRetentionSizeGB) : undefined,
      textRetentionDays: dto.textRetentionDays !== undefined ? String(dto.textRetentionDays) : undefined,
      imageRetentionDays: dto.imageRetentionDays !== undefined ? String(dto.imageRetentionDays) : undefined,
      imageRetentionSizeGB:
        dto.imageRetentionSizeGB !== undefined ? String(dto.imageRetentionSizeGB) : undefined,
      fileRetentionDays: dto.fileRetentionDays !== undefined ? String(dto.fileRetentionDays) : undefined,
      fileRetentionSizeGB:
        dto.fileRetentionSizeGB !== undefined ? String(dto.fileRetentionSizeGB) : undefined,
      retentionSchedule:
        dto.retentionSchedule !== undefined ? dto.retentionSchedule : undefined,
    });
  }

  private normalizeConfig(config: Record<string, string>): RetentionConfig {
    const legacyDays = this.parseIntConfig(config.messageRetentionDays);
    const legacySize = this.parseIntConfig(config.messageRetentionSizeGB);
    const schedule = config.retentionSchedule;
    const normalizedSchedule =
      schedule === 'weekly' || schedule === 'manual' ? schedule : 'daily';

    return {
      textRetentionDays: this.parseIntConfig(config.textRetentionDays, legacyDays),
      imageRetentionDays: this.parseIntConfig(config.imageRetentionDays, legacyDays),
      imageRetentionSizeGB: this.parseIntConfig(config.imageRetentionSizeGB, legacySize),
      fileRetentionDays: this.parseIntConfig(config.fileRetentionDays, legacyDays),
      fileRetentionSizeGB: this.parseIntConfig(config.fileRetentionSizeGB, legacySize),
      schedule: normalizedSchedule,
    };
  }

  private parseIntConfig(raw: string | undefined, fallback = 0): number {
    const parsed = Number.parseInt(raw || '', 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }
}
