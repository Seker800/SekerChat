import { Prisma } from '@prisma/client';

export const groupWithMembersSelect = {
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
  members: {
    orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
    select: {
      role: true,
      joinedAt: true,
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
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      text: true,
      senderId: true,
      type: true,
    },
  },
} satisfies Prisma.GroupSelect;

export type GroupWithMembers = Prisma.GroupGetPayload<{ select: typeof groupWithMembersSelect }>;
export type AdminGroupDiscoveryScope = 'all' | 'archived' | 'former';
export type AuthenticatedActor = { sub: string; role: string };
