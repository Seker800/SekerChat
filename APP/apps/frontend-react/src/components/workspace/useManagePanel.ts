import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  archiveGroup,
  inviteGroupMember,
  removeGroupMember,
  updateGroup,
} from '../../lib/groups-api';
import { setGroupWorkState, type GroupWorkStateResponse } from '../../lib/ops-api';
import type { GroupResponse } from '../../lib/groups-api';

interface UseManagePanelOptions {
  accessToken: string;
  selectedGroupId: string;
  selectedGroup: GroupResponse | undefined;
  canManageGroup: boolean;
  workStateData: GroupWorkStateResponse | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  refetchGroup: () => void;
  refetchGroups: () => void;
  refetchWorkState: () => void;
  refetchUsers?: () => void;
  serverOptions: Array<{ id: string; name: string }>;
}

export function useManagePanel({
  accessToken,
  selectedGroupId,
  selectedGroup,
  canManageGroup,
  workStateData,
  onError,
  onSuccess,
  refetchGroup,
  refetchGroups,
  refetchWorkState,
  refetchUsers,
  serverOptions,
}: UseManagePanelOptions) {
  const queryClient = useQueryClient();
  const [manageName, setManageName] = useState('');
  const [manageServerId, setManageServerId] = useState('');
  const [manageStatus, setManageStatus] = useState<string>('初始');
  const [manageReason, setManageReason] = useState('');
  useEffect(() => {
    if (!selectedGroup) {
      return;
    }

    setManageName(selectedGroup.name);
    setManageServerId(selectedGroup.serverId ?? '');
  }, [selectedGroup]);

  useEffect(() => {
    if (!workStateData && !selectedGroup?.workState) {
      return;
    }

    setManageStatus(workStateData?.status || selectedGroup?.workState?.status || '初始');
    setManageReason(workStateData?.reason || '');
  }, [selectedGroup?.workState, workStateData]);

  const updateGroupMutation = useMutation({
    mutationFn: async (input: { name?: string; serverId?: string }) => {
      const updated = await updateGroup(accessToken, selectedGroupId, {
        name: input.name?.trim() || undefined,
        serverId: input.serverId || undefined,
      });
      return updated;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['group', selectedGroupId], updated);
      queryClient.setQueryData<GroupResponse[]>(['groups'], (current = []) =>
        current.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)),
      );
      refetchGroups();
      refetchGroup();
      onSuccess('频道设置已保存。');
    },
    onError(error) {
      onError(error instanceof Error ? error.message : '保存频道设置失败。');
    },
  });

  const updateWorkStateMutation = useMutation({
    mutationFn: async (input: { status: string; reason?: string }) => {
      return setGroupWorkState(accessToken, selectedGroupId, {
        status: input.status,
        reason: input.reason?.trim() || undefined,
      });
    },
    onSuccess: (updatedWorkState) => {
      queryClient.setQueryData(['work-state', selectedGroupId], updatedWorkState);
      queryClient.setQueryData<GroupResponse[]>(['groups'], (current = []) =>
        current.map((g) =>
          g.id === selectedGroupId
            ? {
                ...g,
                workState: updatedWorkState.updatedAt
                  ? { status: updatedWorkState.status, updatedAt: updatedWorkState.updatedAt }
                  : g.workState,
              }
            : g,
        ),
      );
      refetchWorkState();
      onSuccess('工作状态已保存。');
    },
    onError(error) {
      onError(error instanceof Error ? error.message : '保存工作状态失败。');
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async (email: string) => {
      await inviteGroupMember(accessToken, selectedGroupId, email.trim());
    },
    onSuccess: async () => {
      refetchGroup();
      refetchGroups();
      refetchUsers?.();
      onSuccess('成员已邀请。');
    },
    onError(error) {
      onError(error instanceof Error ? error.message : '邀请成员失败。');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberUserId: string) => {
      if (!canManageGroup) {
        return;
      }

      await removeGroupMember(accessToken, selectedGroupId, memberUserId);
    },
    onSuccess: async () => {
      refetchGroup();
      refetchGroups();
      refetchUsers?.();
      onSuccess('成员已移出频道。');
    },
    onError(error) {
      onError(error instanceof Error ? error.message : '移出成员失败。');
    },
  });

  const groupNameDirty = useMemo(
    () => manageName.trim() !== (selectedGroup?.name ?? ''),
    [manageName, selectedGroup],
  );

  const groupCategoryDirty = useMemo(
    () => Boolean(manageServerId) && manageServerId !== selectedGroup?.serverId,
    [manageServerId, selectedGroup?.serverId],
  );

  const workStateDirty = useMemo(() => {
    const currentStatus = workStateData?.status || selectedGroup?.workState?.status || '初始';
    const currentReason = (workStateData?.reason || '').trim();
    return manageStatus !== currentStatus || manageReason.trim() !== currentReason;
  }, [manageStatus, manageReason, selectedGroup, workStateData]);

  return {
    manage: {
      canManageGroup,
      groupCategoryDirty,
      groupNameDirty,
      isInviting: inviteMemberMutation.isPending,
      isSavingGroup: updateGroupMutation.isPending,
      isSavingWorkState: updateWorkStateMutation.isPending,
      manageServerId,
      serverOptions,
      manageName,
      manageReason,
      manageStatus,
      workStateDirty,
      onArchiveToggle: async () => {
        if (!selectedGroup || !canManageGroup) {
          return;
        }

        try {
          await archiveGroup(accessToken, selectedGroupId, !selectedGroup.archivedAt);
          refetchGroups();
          refetchGroup();
        } catch (error) {
          onError(error instanceof Error ? error.message : '更新归档状态失败。');
        }
      },
      onInviteByEmail: (email: string) => void inviteMemberMutation.mutateAsync(email),
      onManageServerChange: setManageServerId,
      onManageNameChange: setManageName,
      onManageReasonChange: setManageReason,
      onManageStatusChange: setManageStatus,
      onRemoveMember: (memberUserId: string) => void removeMemberMutation.mutateAsync(memberUserId),
      onSaveGroup: () => {
        if (!canManageGroup) return;
        void updateGroupMutation.mutateAsync({
          name: groupNameDirty ? manageName.trim() : undefined,
          serverId: groupCategoryDirty ? manageServerId : undefined,
        });
      },
      onSaveWorkState: () => {
        if (!canManageGroup) return;
        void updateWorkStateMutation.mutateAsync({
          status: manageStatus,
          reason: manageReason.trim() || undefined,
        });
      },
    },
  };
}
