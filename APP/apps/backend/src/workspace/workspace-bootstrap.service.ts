import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DEFAULT_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT,
  MAX_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT,
  type WorkspaceBootstrapMode,
} from '@sekerchat/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DmService } from '../dm/dm.service';
import { GroupsService } from '../groups/groups.service';
import { MessagesService } from '../messages/messages.service';
import { SystemConfigService } from '../system-config/system-config.service';

export interface WorkspaceBootstrapOptions {
  mode?: WorkspaceBootstrapMode;
  groupId?: string;
  dmId?: string;
  messageLimit?: number;
}

@Injectable()
export class WorkspaceBootstrapService {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly dmService: DmService,
    private readonly messagesService: MessagesService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async getBootstrap(user: AuthenticatedUser, options: WorkspaceBootstrapOptions = {}) {
    const mode = options.mode ?? 'server';
    const messageLimit = this.normalizeMessageLimit(options.messageLimit);

    const [systemConfig, groups, dms] = await Promise.all([
      this.systemConfigService.getVisibleConfig(user),
      this.groupsService.listGroups(user.sub, user.role),
      this.dmService.listDMs(user.sub),
    ]);

    const channels = mode === 'dm' ? dms : groups;
    const requestedGroupId = mode === 'dm' ? options.dmId?.trim() : options.groupId?.trim();
    const selectedGroupId = this.resolveSelectedGroupId(channels, requestedGroupId);
    const selectedGroup = channels.find((group) => group.id === selectedGroupId) ?? null;

    const messages = selectedGroupId
      ? await this.messagesService.listMessages(user.sub, selectedGroupId, { limit: messageLimit }, user.role)
      : null;

    return {
      mode,
      systemConfig,
      groups,
      dms,
      selectedGroupId,
      selectedGroup,
      messages,
    };
  }

  private normalizeMessageLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return DEFAULT_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT;
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT) {
      throw new BadRequestException(
        `messageLimit must be an integer from 1 to ${MAX_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT}.`,
      );
    }

    return limit;
  }

  private resolveSelectedGroupId(
    channels: Array<{ id: string }>,
    requestedGroupId: string | undefined,
  ): string {
    if (channels.length === 0) {
      return '';
    }

    if (!requestedGroupId) {
      return channels[0]?.id ?? '';
    }

    return channels.some((group) => group.id === requestedGroupId)
      ? requestedGroupId
      : (channels[0]?.id ?? '');
  }
}
