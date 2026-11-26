import { MessageType, Prisma } from '@prisma/client';

const groupBaseSelect = {
  id: true,
  name: true,
  category: true,
  serverId: true,
  server: {
    select: {
      id: true,
      name: true,
      avatarStorageKey: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  isDM: true,
  archivedAt: true,
  artifactsConfirmedAt: true,
  artifactsConfirmedByUserId: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  workState: {
    select: {
      status: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.GroupSelect;

export const groupWithMembersSelect = {
  ...groupBaseSelect,
  members: {
    orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
    select: {
      role: true,
      joinedAt: true,
      notificationsMuted: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarStorageKey: true,
          dndUntil: true,
        },
      },
    },
  },
} satisfies Prisma.GroupSelect;

/** The list view needs a count and the caller's membership, not every member. */
export function groupSummarySelect(userId: string) {
  return {
    ...groupBaseSelect,
    _count: { select: { members: true } },
    members: {
      where: { userId },
      select: { role: true, notificationsMuted: true },
    },
  } satisfies Prisma.GroupSelect;
}

export type LatestMessageSummary = {
  text: string | null;
  senderId: string;
  type: MessageType;
};

export type GroupWithMembers = Prisma.GroupGetPayload<{
  select: typeof groupWithMembersSelect;
}> & { latestMessage?: LatestMessageSummary | null };

export type GroupSummaryRecord = Prisma.GroupGetPayload<{
  select: ReturnType<typeof groupSummarySelect>;
}>;

export type GroupListItem = GroupWithMembers & {
  memberCount?: number;
  currentUserMembership?: { role: 'ADMIN' | 'MEMBER'; notificationsMuted: boolean } | null;
  isMember?: boolean;
};
export type AdminGroupDiscoveryScope = 'all' | 'archived' | 'former';
export type AuthenticatedActor = { sub: string; role: string };
