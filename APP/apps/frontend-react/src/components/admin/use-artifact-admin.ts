import { useEffect, useMemo, useState } from 'react';
import type { AdminArtifactResponse } from '../../lib/messages-files-api';

export type ArtifactFilters = {
  query: string;
  groupWorkStatus: string;
  packedState: '' | 'packed' | 'unpacked';
};

export type ArtifactSortKey = 'name' | 'uploader' | 'size' | 'createdAt';
export type ArtifactSortDirection = 'asc' | 'desc';

export type GroupNode = {
  groupId: string;
  groupName: string;
  groupWorkStatus: string | null;
  items: AdminArtifactResponse[];
};

export type ServerNode = {
  serverName: string;
  groups: GroupNode[];
};

export const DEFAULT_FILTERS: ArtifactFilters = {
  query: '',
  groupWorkStatus: '',
  packedState: '',
};

export function useArtifactFilters() {
  const [filters, setFilters] = useState<ArtifactFilters>(DEFAULT_FILTERS);
  return { filters, setFilters };
}

export function useArtifactTree(items: AdminArtifactResponse[]) {
  const tree = useMemo<ServerNode[]>(() => {
    const serverMap = new Map<string, Map<string, GroupNode>>();

    for (const item of items) {
      if (!serverMap.has(item.groupCategory)) {
        serverMap.set(item.groupCategory, new Map());
      }
      const groupMap = serverMap.get(item.groupCategory)!;
      if (!groupMap.has(item.groupId)) {
        groupMap.set(item.groupId, {
          groupId: item.groupId,
          groupName: item.groupName,
          groupWorkStatus: item.groupWorkStatus,
          items: [],
        });
      }
      groupMap.get(item.groupId)!.items.push(item);
    }

    return Array.from(serverMap.entries())
      .map(([serverName, groups]) => ({
        serverName,
        groups: Array.from(groups.values()).sort((left, right) =>
          left.groupName.localeCompare(right.groupName, 'zh-CN'),
        ),
      }))
      .sort((left, right) => left.serverName.localeCompare(right.serverName, 'zh-CN'));
  }, [items]);

  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedServers((current) => {
      const next: Record<string, boolean> = {};
      for (const server of tree) {
        next[server.serverName] = current[server.serverName] ?? true;
      }
      return next;
    });
  }, [tree]);

  const groupNodes = useMemo(() => tree.flatMap((server) => server.groups), [tree]);

  return { tree, expandedServers, setExpandedServers, groupNodes };
}

export function useArtifactSelection(
  groupNodes: GroupNode[],
  tree: ServerNode[],
) {
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedArtifactId, setSelectedArtifactId] = useState('');

  useEffect(() => {
    if (!groupNodes.some((group) => group.groupId === selectedGroupId)) {
      setSelectedGroupId(groupNodes[0]?.groupId ?? '');
    }
  }, [groupNodes, selectedGroupId]);

  const currentGroup = useMemo(
    () => groupNodes.find((group) => group.groupId === selectedGroupId) ?? null,
    [groupNodes, selectedGroupId],
  );

  useEffect(() => {
    if (!currentGroup?.items.some((item) => item.id === selectedArtifactId)) {
      setSelectedArtifactId(currentGroup?.items[0]?.id ?? '');
    }
  }, [currentGroup, selectedArtifactId]);

  const currentServerName = useMemo(() => {
    const server = tree.find((candidate) =>
      candidate.groups.some((group) => group.groupId === selectedGroupId),
    );
    return server?.serverName ?? '';
  }, [selectedGroupId, tree]);

  return {
    selectedGroupId,
    setSelectedGroupId,
    selectedArtifactId,
    setSelectedArtifactId,
    currentGroup,
    currentServerName,
  };
}

export function useArtifactSort(currentGroup: GroupNode | null) {
  const [sortKey, setSortKey] = useState<ArtifactSortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<ArtifactSortDirection>('desc');

  const sortedArtifacts = useMemo(() => {
    const itemsToSort = currentGroup?.items ? [...currentGroup.items] : [];

    itemsToSort.sort((left, right) => {
      let comparison = 0;

      switch (sortKey) {
        case 'name':
          comparison = left.originalName.localeCompare(right.originalName, 'zh-CN');
          break;
        case 'uploader': {
          const leftUploader = left.uploaderDisplayName?.trim() || '';
          const rightUploader = right.uploaderDisplayName?.trim() || '';
          comparison = leftUploader.localeCompare(rightUploader, 'zh-CN');
          break;
        }
        case 'size':
          comparison = left.size - right.size;
          break;
        case 'createdAt':
          comparison = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
          break;
        default:
          comparison = 0;
      }

      if (comparison === 0) {
        comparison = left.originalName.localeCompare(right.originalName, 'zh-CN');
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return itemsToSort;
  }, [currentGroup, sortDirection, sortKey]);

  function toggleSort(nextKey: ArtifactSortKey) {
    setSortKey((currentKey) => {
      if (currentKey === nextKey) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentKey;
      }
      setSortDirection(nextKey === 'createdAt' ? 'desc' : 'asc');
      return nextKey;
    });
  }

  function sortArrow(key: ArtifactSortKey): string {
    if (sortKey !== key) return '';
    return sortDirection === 'asc' ? '↑' : '↓';
  }

  return { sortKey, sortDirection, sortedArtifacts, toggleSort, sortArrow };
}
