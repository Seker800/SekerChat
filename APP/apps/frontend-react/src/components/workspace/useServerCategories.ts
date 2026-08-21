import { useMemo } from 'react';
import type { GroupResponse } from '../../lib/groups-api';

export const DEFAULT_CATEGORY = '未分类';

export function getCategoryName(group: Pick<GroupResponse, 'category'>): string {
  return group.category?.trim() || DEFAULT_CATEGORY;
}

export function getServerId(group: Pick<GroupResponse, 'serverId' | 'category'>): string {
  return group.serverId ?? `legacy:${getCategoryName(group)}`;
}

export function buildCategoryStats(groups: GroupResponse[], categoryName: string) {
  const matchedGroups = groups.filter((group) => getCategoryName(group) === categoryName);
  const activeCount = matchedGroups.filter((group) => !group.archivedAt).length;
  const archivedCount = matchedGroups.length - activeCount;
  const latestUpdatedAt =
    [...matchedGroups].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )[0]?.updatedAt ?? null;

  return {
    name: categoryName,
    groupCount: matchedGroups.length,
    archivedGroupCount: archivedCount,
    activeGroupCount: activeCount,
    latestUpdatedAt,
  };
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

interface UseServerCategoriesOptions {
  channels: GroupResponse[];
  selectedGroup: GroupResponse | undefined;
  servers: GroupResponse[];
}

export interface CategoryRailItem {
  id: string;
  name: string;
  activeCount: number;
  unreadCount: number;
  avatarUrl: string | null;
  isArchived: boolean;
}

export function useServerCategories({
  channels,
  selectedGroup,
  servers,
}: UseServerCategoriesOptions) {
  const activeChannels = useMemo(() => channels.filter((item) => !item.archivedAt), [channels]);
  const selectedServerId = useMemo(
    () =>
      getServerId(
        selectedGroup ?? activeChannels[0] ?? { serverId: null, category: DEFAULT_CATEGORY },
      ),
    [activeChannels, selectedGroup],
  );
  const selectedCategoryName =
    selectedGroup?.server?.name ??
    getCategoryName(selectedGroup ?? activeChannels[0] ?? { category: DEFAULT_CATEGORY });

  /** All categories the user has groups in, ordered by latest activity, split into active vs archived. */
  const { categoryRailItems, archivedCategoryRailItems } = useMemo(() => {
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
      }
    >();

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
      };

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

    const all: CategoryRailItem[] = [];
    const archived: CategoryRailItem[] = [];

    for (const entry of map.values()) {
      const item: CategoryRailItem = {
        id: entry.id,
        name: entry.name,
        activeCount: entry.activeCount,
        unreadCount: entry.unreadCount,
        avatarUrl: entry.avatarUrl,
        isArchived: Boolean(entry.categoryArchivedAt),
      };

      if (item.isArchived) {
        archived.push(item);
      }
      // Always include in main rail if has any groups (active or all-archived but not category-archived)
      if (entry.activeCount > 0 || entry.archivedGroupCount > 0) {
        if (!item.isArchived) {
          all.push(item);
        }
      }
    }

    all.sort((a, b) => {
      const aTs = map.get(a.id)?.latestUpdatedAt ?? 0;
      const bTs = map.get(b.id)?.latestUpdatedAt ?? 0;
      return bTs - aTs;
    });
    archived.sort((a, b) => {
      const aTs = map.get(a.id)?.latestUpdatedAt ?? 0;
      const bTs = map.get(b.id)?.latestUpdatedAt ?? 0;
      return bTs - aTs;
    });

    return { categoryRailItems: all, archivedCategoryRailItems: archived };
  }, [servers]);

  const categoryNames = useMemo(
    () => categoryRailItems.map((item) => item.name),
    [categoryRailItems],
  );

  const categoryGroups = useMemo(() => {
    const filtered = activeChannels.filter((group) => getServerId(group) === selectedServerId);
    const withTs = filtered.map((g) => ({ g, ts: new Date(g.updatedAt).getTime() }));
    withTs.sort((a, b) => b.ts - a.ts);
    return withTs.map(({ g }) => g);
  }, [activeChannels, selectedServerId]);

  const archivedCategoryGroups = useMemo(() => {
    const filtered = channels.filter(
      (group) => Boolean(group.archivedAt) && getServerId(group) === selectedServerId,
    );
    const withTs = filtered.map((g) => ({ g, ts: new Date(g.updatedAt).getTime() }));
    withTs.sort((a, b) => b.ts - a.ts);
    return withTs.map(({ g }) => g).slice(0, 8);
  }, [channels, selectedServerId]);

  const selectedCategoryStats = useMemo(
    () => buildServerStats(servers, selectedServerId),
    [servers, selectedServerId],
  );

  return {
    activeChannels,
    archivedCategoryGroups,
    archivedCategoryRailItems,
    categoryGroups,
    categoryNames: categoryRailItems.map((item) => item.name),
    serverOptions: categoryRailItems.map((item) => ({ id: item.id, name: item.name })),
    categoryRailItems,
    selectedCategoryName,
    selectedServerId,
    selectedCategoryStats,
  };
}
