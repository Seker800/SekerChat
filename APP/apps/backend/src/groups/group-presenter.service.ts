import { Injectable } from '@nestjs/common';
import { GroupMemberRole } from '@prisma/client';
import { isDndActive } from '@sekerchat/shared';
import { AvatarsService } from '../avatars/avatars.service';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { resolveGroupUserName } from './group-name';
import { GroupWithMembers } from './group-types';

export interface GroupSerializePrefetch {
  /** category name → avatarStorageKey */
  categoryAvatars: Map<string, string | null>;
  /** category name → archivedAt */
  categoryArchivedAts: Map<string, string | null>;
  /** userId → displayName */
  userDisplayNames: Map<string, string>;
}

@Injectable()
export class GroupPresenter {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly avatarsService: AvatarsService,
    private readonly realtimePublisher: GroupRealtimePublisher,
  ) {}

  async serializeGroup(
    group: GroupWithMembers,
    membershipOrUserId: GroupMemberRole | string,
    maybeUserId?: string,
    unreadCount?: number,
    prefetch?: GroupSerializePrefetch,
  ) {
    const onlineIds = this.realtimePublisher.getBrowserOnlineUserIds();
    const currentUserId = maybeUserId ?? membershipOrUserId;
    const currentUserRole =
      maybeUserId === undefined
        ? group.members.find((member) => member.user.id === currentUserId)?.role
        : membershipOrUserId;

    const categoryRow = prefetch
      ? null
      : await this.prismaService.category.findUnique({
          where: { name: group.category },
          select: { avatarStorageKey: true, archivedAt: true },
        });

    const categoryAvatarKey =
      group.server?.avatarStorageKey ??
      (prefetch
        ? (prefetch.categoryAvatars.get(group.category) ?? null)
        : (categoryRow?.avatarStorageKey ?? null));

    const categoryArchivedAt =
      group.server?.archivedAt ??
      (prefetch
        ? (prefetch.categoryArchivedAts.get(group.category) ?? null)
        : (categoryRow?.archivedAt ?? null));
    const serverName = group.server?.name ?? group.category;

    const dmPartner = group.isDM
      ? group.members.find((member) => member.user.id !== currentUserId)?.user
      : null;
    const dmPartnerName = dmPartner?.displayName ?? dmPartner?.email;
    const latestMsg = group.messages?.[0] ?? null;

    const confirmedByDisplayName = group.artifactsConfirmedByUserId
      ? prefetch
        ? (prefetch.userDisplayNames.get(group.artifactsConfirmedByUserId) ?? '未知用户')
        : await resolveGroupUserName(this.prismaService, group.artifactsConfirmedByUserId)
      : null;

    return {
      id: group.id,
      name: dmPartnerName ?? group.name,
      category: serverName,
      serverId: group.serverId,
      server: group.server
        ? {
            id: group.server.id,
            name: group.server.name,
            avatarUrl: this.avatarsService.buildServerAvatarUrl(
              group.server.id,
              group.server.avatarStorageKey,
            ),
            archivedAt: group.server.archivedAt,
            createdAt: group.server.createdAt,
            updatedAt: group.server.updatedAt,
          }
        : null,
      isDM: group.isDM,
      categoryArchivedAt,
      latestMessage: latestMsg
        ? {
            text: latestMsg.text,
            senderId: latestMsg.senderId,
            type: latestMsg.type,
          }
        : null,
      workState: group.workState
        ? {
            status: group.workState.status,
            updatedAt: group.workState.updatedAt,
          }
        : null,
      artifactConfirmation: {
        isConfirmed: Boolean(group.artifactsConfirmedAt),
        confirmedAt: group.artifactsConfirmedAt,
        confirmedByUserId: group.artifactsConfirmedByUserId,
        confirmedByDisplayName,
      },
      archivedAt: group.archivedAt,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      createdById: group.createdById,
      serverAvatarUrl: group.server
        ? this.avatarsService.buildServerAvatarUrl(group.server.id, categoryAvatarKey)
        : this.avatarsService.buildLegacyServerAvatarUrl(group.category, categoryAvatarKey),
      currentUserRole,
      unreadCount: unreadCount ?? 0,
      members: group.members.map((member) => {
        const isOnline = onlineIds.has(member.user.id);
        return {
          userId: member.user.id,
          email: member.user.email,
          displayName: member.user.displayName,
          avatarUrl: this.avatarsService.buildUserAvatarUrl(
            member.user.id,
            member.user.avatarStorageKey,
          ),
          role: member.role,
          joinedAt: member.joinedAt,
          isOnline,
          isDnd: isOnline && isDndActive(member.user.dndUntil),
        };
      }),
    };
  }

  serializeInviteCandidate(user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarStorageKey: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: this.avatarsService.buildUserAvatarUrl(user.id, user.avatarStorageKey),
    };
  }
}
