import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_LABELS,
  type SystemPermission,
} from '@sekerchat/shared';
import { resolveActorType } from '../common/bot-identity';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionConfigService } from './permission-config.service';

const BASE_MEMBER_COMMANDS = [
  'whoami',
  'capabilities',
  'channel.list',
  'channel.show',
  'channel.leave',
  'channel.mark-read',
  'msg.list',
  'msg.send',
  'msg.reply',
  'msg.recall',
  'msg.edit',
  'task.list',
  'task.create',
  'task.done',
  'task.undone',
  'status.list',
  'status.get',
  'member.list',
  'artifact.list',
  'artifact.upload',
  'artifact.download',
  'file.upload',
  'avatar.upload',
  'dm.list',
  'dm.open',
  'dm.send',
  'dm.recall',
  'dm.edit',
].sort();

const CLI_ALLOWED_COMMANDS_BY_PERMISSION: Record<SystemPermission, string[]> = {
  create_group: ['channel.create'],
  manage_group_settings: [],
  invite_members: ['member.invite'],
  remove_members: ['member.remove'],
  manage_work_status: ['status.set'],
  manage_artifacts: ['artifact.delete'],
  archive_group: ['channel.archive', 'channel.unarchive'],
  manage_user_roles: ['user.role'],
  manage_system_config: [],
  upload_server_avatar: [],
  view_archived_channels: ['channel.list', 'channel.show'],
  view_all_groups: ['admin.discovery', 'admin.categories'],
  join_any_group: ['admin.join'],
  access_admin_page: [],
  view_admin_artifacts: [],
  view_presence_logs: ['presence-log.list'],
  view_user_directory: ['user.list', 'dm.list', 'dm.open'],
  manage_bans: [],
  manage_subscription_posts: [],
  manage_album: [],
};

@Injectable()
export class CapabilitiesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly permissionConfigService: PermissionConfigService,
  ) {}

  async getCapabilities(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isBot: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const rolePermissions = await this.permissionConfigService.getRolePermissions();
    const permissions =
      user.role === 'SUPER_ADMIN'
        ? (Object.keys(PERMISSION_LABELS) as SystemPermission[])
        : (rolePermissions[user.role] ?? []);
    const allowedCommands = [
      ...new Set([
        ...BASE_MEMBER_COMMANDS,
        ...permissions.flatMap(
          (permission) => CLI_ALLOWED_COMMANDS_BY_PERMISSION[permission] ?? [],
        ),
      ]),
    ].sort();

    return {
      actorType: resolveActorType(user),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      permissions: permissions.map((permission) => ({
        key: permission,
        label: PERMISSION_LABELS[permission],
        description: PERMISSION_DESCRIPTIONS[permission],
      })),
      allowedCommands,
      scopes: {
        groups: 'membership',
        admin: user.role === 'SUPER_ADMIN' || permissions.includes('access_admin_page'),
      },
    };
  }
}
