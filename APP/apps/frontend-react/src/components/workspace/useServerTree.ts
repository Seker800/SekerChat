import { useMemo } from 'react';
import type { GroupResponse, ServerResponse } from '../../lib/groups-api';

const DEFAULT_CATEGORY = '未分类';

export function getCategoryName(group: Pick<GroupResponse, 'category'>): string {
  return group.category?.trim() || DEFAULT_CATEGORY;
}

export function getServerId(group: Pick<GroupResponse, 'serverId' | 'category'>): string {
  return group.serverId ?? `legacy:${getCategoryName(group)}`;
}

export function buildServerStats(groups: GroupResponse[], serverId: string) {
  const matchedGroups = groups.filter((group) => getServerId(group) === serverId);
  const serverName =
    matchedGroups[0]?.server?.name ??
    getCategoryName(matchedGroups[0] ?? { category: DEFAULT_CATEGORY });
  const activeGroupCount = matchedGroups.filter((group) => !group.archivedAt).length;
  const latestUpdatedAt = matchedGroups.reduce<string | null>((latest, group) => {
    if (!latest || new Date(group.updatedAt).getTime() > new Date(latest).getTime()) {
      return group.updatedAt;
    }
    return latest;
  }, null);

  return {
    serverId,
    name: serverName,
    groupCount: matchedGroups.length,
    archivedGroupCount: matchedGroups.length - activeGroupCount,
    activeGroupCount,
    latestUpdatedAt,
  };
}

interface UseServerTreeOptions {
  groups: GroupResponse[];
  selectedGroup: GroupResponse | undefined;
  servers: GroupResponse[];
  serverDirectory?: ServerResponse[];
  canAccessAllChannels?: boolean;
}

export interface ServerRailItem {
  id: string;
  name: string;
  activeCount: number;
  unreadCount: number;
  avatarUrl: string | null;
  isArchived: boolean;
  isMember?: boolean;
}

export function resolveServerLandingGroup(
  groups: Array<{
    id: string;
    serverId?: string | null;
    archivedAt?: string | null;
    updatedAt: string;
  }>,
  serverId: string,
) {
  const serverGroups = groups
    .filter((group) => group.serverId === serverId)
    .sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );

  return serverGroups.find((group) => !group.archivedAt) ?? serverGroups[0] ?? null;
}

export function useServerTree({
  groups,
  selectedGroup,
  servers,
  serverDirectory = [],
  canAccessAllChannels = false,
}: UseServerTreeOptions) {
  const activeGroups = useMemo(() => groups.filter((item) => !item.archivedAt), [groups]);
  const selectedServerId = useMemo(
    () =>
      getServerId(
        selectedGroup ?? activeGroups[0] ?? { serverId: null, category: DEFAULT_CATEGORY },
      ),
    [activeGroups, selectedGroup],
  );
  const selectedServerName =
    selectedGroup?.server?.name ??
    getCategoryName(selectedGroup ?? activeGroups[0] ?? { category: DEFAULT_CATEGORY });

  /** Joined servers in the main rail; unjoined and archived servers in the collapsed section. */
  const { serverRailItems, archivedServerRailItems, unjoinedServerRailItems } = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        id: string;
        activeCount: number;
        unreadCount: number;
        avatarUrl: string | null;
        latestUpdatedAt: number;
        archivedGroupCount: number;
        categoryArchivedAt: string | null;
        isMember: boolean;
      }
    >();

    if (canAccessAllChannels) {
      for (const server of serverDirectory) {
        map.set(server.id, {
          id: server.id,
          name: server.name,
          activeCount: 0,
          unreadCount: 0,
          avatarUrl: server.avatarUrl ?? null,
          latestUpdatedAt: new Date(server.updatedAt).getTime(),
          archivedGroupCount: 0,
          categoryArchivedAt: server.archivedAt ?? null,
          isMember: server.isMember !== false,
        });
      }
    }

    for (const group of servers) {
      const serverId = getServerId(group);
      const categoryName = group.server?.name ?? getCategoryName(group);
      const groupTs = new Date(group.updatedAt).getTime();
      const entry = map.get(serverId) ?? {
        id: serverId,
        name: categoryName,
        activeCount: 0,
        unreadCount: 0,
        avatarUrl: null,
        latestUpdatedAt: 0,
        archivedGroupCount: 0,
        categoryArchivedAt: group.categoryArchivedAt ?? null,
        isMember: true,
      };

      entry.isMember = true;
      if (!group.archivedAt) {
        entry.activeCount += 1;
        entry.unreadCount += group.unreadCount ?? 0;
      } else {
        entry.archivedGroupCount += 1;
      }
      if (!entry.avatarUrl && group.serverAvatarUrl) {
        entry.avatarUrl = group.serverAvatarUrl;
      }
      if (!entry.categoryArchivedAt && group.categoryArchivedAt) {
        entry.categoryArchivedAt = group.categoryArchivedAt;
      }
      if (groupTs > entry.latestUpdatedAt) {
        entry.latestUpdatedAt = groupTs;
      }

      map.set(serverId, entry);
    }

    const all: ServerRailItem[] = [];
    const archived: ServerRailItem[] = [];
    const unjoined: ServerRailItem[] = [];

    for (const entry of map.values()) {
      const item: ServerRailItem = {
        id: entry.id,
        name: entry.name,
        activeCount: entry.activeCount,
        unreadCount: entry.unreadCount,
        avatarUrl: entry.avatarUrl,
        isArchived: Boolean(entry.categoryArchivedAt),
        isMember: entry.isMember,
      };

      if (item.isArchived) {
        archived.push(item);
        continue;
      }
      if (!entry.isMember) {
        unjoined.push(item);
        continue;
      }
      all.push(item);
    }

    const byLatestActivity = (left: ServerRailItem, right: ServerRailItem) =>
      (map.get(right.id)?.latestUpdatedAt ?? 0) - (map.get(left.id)?.latestUpdatedAt ?? 0);

    all.sort(byLatestActivity);
    archived.sort(byLatestActivity);
    unjoined.sort(byLatestActivity);

    return {
      serverRailItems: all,
      archivedServerRailItems: archived,
      unjoinedServerRailItems: unjoined,
    };
  }, [canAccessAllChannels, serverDirectory, servers]);

  const serverNames = useMemo(() => serverRailItems.map((item) => item.name), [serverRailItems]);

  const serverGroups = useMemo(() => {
    const filtered = activeGroups.filter((group) => getServerId(group) === selectedServerId);
    const withTs = filtered.map((g) => ({ g, ts: new Date(g.updatedAt).getTime() }));
    withTs.sort((a, b) => b.ts - a.ts);
    return withTs.map(({ g }) => g);
  }, [activeGroups, selectedServerId]);

  const archivedServerGroups = useMemo(() => {
    const filtered = groups.filter(
      (group) => Boolean(group.archivedAt) && getServerId(group) === selectedServerId,
    );
    const withTs = filtered.map((g) => ({ g, ts: new Date(g.updatedAt).getTime() }));
    withTs.sort((a, b) => b.ts - a.ts);
    return withTs.map(({ g }) => g).slice(0, 8);
  }, [groups, selectedServerId]);

  return {
    activeGroups,
    archivedServerGroups,
    archivedServerRailItems,
    serverGroups,
    serverNames: serverRailItems.map((item) => item.name),
    serverOptions: serverRailItems.map((item) => ({ id: item.id, name: item.name })),
    serverRailItems,
    unjoinedServerRailItems,
    selectedServerName,
    selectedServerId,
  };
}
