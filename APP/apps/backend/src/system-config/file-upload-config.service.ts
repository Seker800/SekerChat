import { Injectable } from '@nestjs/common';
import {
  DEFAULT_CHAT_ATTACHMENT_MAX_MB,
  DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_MB,
  MAX_CHAT_ATTACHMENT_MAX_MB,
  MAX_SUBSCRIPTION_ATTACHMENT_MAX_MB,
  MIN_CHAT_ATTACHMENT_MAX_MB,
  MIN_SUBSCRIPTION_ATTACHMENT_MAX_MB,
  chatAttachmentMbToBytes,
} from '@sekerchat/shared';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigStoreService } from './system-config-store.service';

@Injectable()
export class FileUploadConfigService {
  constructor(private readonly store: SystemConfigStoreService) {}

  async getChatAttachmentMaxMB(): Promise<number> {
    const value = await this.store.getValue('chatAttachmentMaxMB');
    return this.normalizeMbValue(value);
  }

  async getChatAttachmentMaxBytes(): Promise<number> {
    return chatAttachmentMbToBytes(await this.getChatAttachmentMaxMB());
  }

  async getSubscriptionAttachmentMaxMB(): Promise<number> {
    const value = await this.store.getValue('subscriptionAttachmentMaxMB');
    return this.normalizeSubscriptionMbValue(value);
  }

  async getSubscriptionAttachmentMaxBytes(): Promise<number> {
    return chatAttachmentMbToBytes(await this.getSubscriptionAttachmentMaxMB());
  }

  async updateFromDto(dto: UpdateSystemConfigDto): Promise<void> {
    await this.store.upsertMany({
      chatAttachmentMaxMB:
        dto.chatAttachmentMaxMB !== undefined ? String(this.normalizeMbValue(dto.chatAttachmentMaxMB)) : undefined,
      subscriptionAttachmentMaxMB:
        dto.subscriptionAttachmentMaxMB !== undefined
          ? String(this.normalizeSubscriptionMbValue(dto.subscriptionAttachmentMaxMB))
          : undefined,
    });
  }

  private normalizeMbValue(raw: string | number | undefined): number {
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(raw || '', 10);
    if (Number.isNaN(parsed)) {
      return DEFAULT_CHAT_ATTACHMENT_MAX_MB;
    }

    return Math.min(MAX_CHAT_ATTACHMENT_MAX_MB, Math.max(MIN_CHAT_ATTACHMENT_MAX_MB, Math.round(parsed)));
  }

  private normalizeSubscriptionMbValue(raw: string | number | undefined): number {
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(raw || '', 10);
    if (Number.isNaN(parsed)) {
      return DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_MB;
    }

    return Math.min(
      MAX_SUBSCRIPTION_ATTACHMENT_MAX_MB,
      Math.max(MIN_SUBSCRIPTION_ATTACHMENT_MAX_MB, Math.round(parsed)),
    );
  }
}
