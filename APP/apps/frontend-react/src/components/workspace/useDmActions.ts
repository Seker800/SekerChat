import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';
import { createOrGetDM, listDMs } from '../../lib/dm-api';
import type { GroupResponse } from '../../lib/groups-api';
import type { WorkspaceMode } from '../../store/workspace-store';

interface UseDmActionsOptions {
  accessToken: string;
  navigate: NavigateFunction;
  pushNotice: (tone: 'success' | 'info' | 'error', text: string) => void;
  queryClient: QueryClient;
  setIsStartDMDialogOpen: (isOpen: boolean) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  unhideDmFromStore: (groupId: string) => void;
}

export function useDmActions({
  accessToken,
  navigate,
  pushNotice,
  queryClient,
  setIsStartDMDialogOpen,
  setWorkspaceMode,
  unhideDmFromStore,
}: UseDmActionsOptions) {
  const cacheStartedDM = useCallback((dmGroup: GroupResponse) => {
    unhideDmFromStore(dmGroup.id);
    queryClient.setQueryData<GroupResponse[]>(['dms'], (old) => {
      if (!old?.some((group) => group.id === dmGroup.id)) {
        return [dmGroup, ...(old ?? [])];
      }

      return old;
    });
  }, [queryClient, unhideDmFromStore]);

  const refetchDMs = useCallback(() => {
    void queryClient.fetchQuery({
      queryKey: ['dms'],
      queryFn: () => listDMs(accessToken),
    });
  }, [accessToken, queryClient]);

  const openDM = useCallback((dmGroupId: string, dmGroup?: GroupResponse) => {
    setIsStartDMDialogOpen(false);
    setWorkspaceMode('dm');
    if (dmGroup) {
      cacheStartedDM(dmGroup);
    }
    void navigate(`/dm/${dmGroupId}`);
    refetchDMs();
  }, [cacheStartedDM, navigate, refetchDMs, setIsStartDMDialogOpen, setWorkspaceMode]);

  const startDMWithUser = useCallback(async (userId: string) => {
    try {
      const dmGroup = await createOrGetDM(accessToken, userId);
      openDM(dmGroup.id, dmGroup);
    } catch (error) {
      pushNotice('error', error instanceof Error ? error.message : '打开私聊失败。');
    }
  }, [accessToken, openDM, pushNotice]);

  return {
    onDMStarted: openDM,
    startDMWithUser,
  };
}
