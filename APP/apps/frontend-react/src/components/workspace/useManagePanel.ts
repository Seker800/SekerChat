import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  archiveGroup,
  inviteGroupMember,
  removeGroupMember,
  updateGroup,
  type GroupResponse,
} from '../../lib/groups-api';
import { setGroupWorkState, type GroupWorkStateResponse } from '../../lib/ops-api';

interface UseManagePanelOptions {
  accessToken: string;
  selectedGroupId: string;
  selectedGroup: GroupResponse | undefined;
  canManageGroup: boolean;
  workStateData: GroupWorkStateResponse | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  serverOptions: Array<{ id: string; name: string }>;
}

interface SettingsDraft {
  groupId: string;
  name?: string;
  serverId?: string;
  status?: string;
  reason?: string;
}

export function useManagePanel({
  accessToken,
  selectedGroupId,
  selectedGroup,
  canManageGroup,
  workStateData,
  onError,
  onSuccess,
  serverOptions,
}: UseManagePanelOptions) {
  const queryClient = useQueryClient();
  // Only edited fields are local state. Untouched fields follow the server snapshot.
  const [draft, setDraft] = useState<SettingsDraft>({ groupId: selectedGroupId });
  const currentDraft = draft.groupId === selectedGroupId ? draft : { groupId: selectedGroupId };
  const manageName = currentDraft.name ?? selectedGroup?.name ?? '';
  const manageServerId = currentDraft.serverId ?? selectedGroup?.serverId ?? '';
  const serverStatus = workStateData?.status || selectedGroup?.workState?.status || '初始';
  const serverReason = workStateData?.reason ?? '';
  const manageStatus = currentDraft.status ?? serverStatus;
  const manageReason = currentDraft.reason ?? serverReason;

  function editDraft(patch: Partial<Omit<SettingsDraft, 'groupId'>>) {
    setDraft((current) => ({
      ...(current.groupId === selectedGroupId ? current : {}),
      groupId: selectedGroupId,
      ...patch,
    }));
  }

  function acknowledgeSavedFields(groupId: string, saved: Partial<Omit<SettingsDraft, 'groupId'>>) {
    setDraft((current) => {
      if (current.groupId !== groupId) return current;
      const next = { ...current };
      for (const field of ['name', 'serverId', 'status', 'reason'] as const) {
        // An earlier save must not clear text typed while it was in flight.
        if (saved[field] !== undefined && current[field] === saved[field]) delete next[field];
      }
      return next;
    });
  }

  function refreshMembership(groupId: string) {
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    void queryClient.invalidateQueries({ queryKey: ['users', 'invitable', groupId] });
  }

  const updateGroupMutation = useMutation({
    mutationFn: ({
      groupId,
      name,
      serverId,
    }: {
      groupId: string;
      name?: string;
      serverId?: string;
    }) =>
      updateGroup(accessToken, groupId, {
        name: name?.trim() || undefined,
        serverId: serverId || undefined,
      }),
    onSuccess: (updated, submitted) => {
      queryClient.setQueryData(['group', updated.id], updated);
      queryClient.setQueryData<GroupResponse[]>(['groups'], (current) =>
        current?.map((group) => (group.id === updated.id ? { ...group, ...updated } : group)),
      );
      acknowledgeSavedFields(submitted.groupId, submitted);
      void queryClient.invalidateQueries({ queryKey: ['workspace-bootstrap'] });
      onSuccess('频道设置已保存。');
    },
    onError: (error) => onError(error instanceof Error ? error.message : '保存频道设置失败。'),
  });

  const updateWorkStateMutation = useMutation({
    mutationFn: ({
      groupId,
      status,
      reason,
    }: {
      groupId: string;
      status: string;
      reason: string;
    }) => setGroupWorkState(accessToken, groupId, { status, reason: reason.trim() || undefined }),
    onSuccess: (updated, submitted) => {
      queryClient.setQueryData(['work-state', submitted.groupId], updated);
      const patchGroup = (group: GroupResponse): GroupResponse => ({
        ...group,
        workState: updated.updatedAt
          ? { status: updated.status, updatedAt: updated.updatedAt }
          : group.workState,
      });
      queryClient.setQueryData<GroupResponse[]>(['groups'], (current) =>
        current?.map((group) => (group.id === submitted.groupId ? patchGroup(group) : group)),
      );
      queryClient.setQueryData<GroupResponse>(['group', submitted.groupId], (current) =>
        current ? patchGroup(current) : current,
      );
      acknowledgeSavedFields(submitted.groupId, submitted);
      void queryClient.invalidateQueries({ queryKey: ['workspace-bootstrap'] });
      onSuccess('工作状态已保存。');
    },
    onError: (error) => onError(error instanceof Error ? error.message : '保存工作状态失败。'),
  });

  const inviteMemberMutation = useMutation({
    mutationFn: ({ groupId, email }: { groupId: string; email: string }) =>
      inviteGroupMember(accessToken, groupId, email.trim()),
    onSuccess: (_result, { groupId }) => {
      refreshMembership(groupId);
      onSuccess('成员已邀请。');
    },
    onError: (error) => onError(error instanceof Error ? error.message : '邀请成员失败。'),
  });
  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, memberUserId }: { groupId: string; memberUserId: string }) =>
      removeGroupMember(accessToken, groupId, memberUserId),
    onSuccess: (_result, { groupId }) => {
      refreshMembership(groupId);
      onSuccess('成员已移出频道。');
    },
    onError: (error) => onError(error instanceof Error ? error.message : '移出成员失败。'),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ groupId, archive }: { groupId: string; archive: boolean }) =>
      archiveGroup(accessToken, groupId, archive),
    onSuccess: (_result, { groupId }) => refreshMembership(groupId),
    onError: (error) => onError(error instanceof Error ? error.message : '更新归档状态失败。'),
  });

  const groupNameDirty = manageName.trim() !== (selectedGroup?.name ?? '');
  const groupCategoryDirty = Boolean(manageServerId) && manageServerId !== selectedGroup?.serverId;
  const workStateDirty = useMemo(
    () => manageStatus !== serverStatus || manageReason.trim() !== serverReason.trim(),
    [manageStatus, manageReason, serverStatus, serverReason],
  );

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
      onArchiveToggle: () => {
        if (selectedGroup && canManageGroup)
          archiveMutation.mutate({ groupId: selectedGroupId, archive: !selectedGroup.archivedAt });
      },
      onInviteByEmail: (email: string) =>
        inviteMemberMutation.mutate({ groupId: selectedGroupId, email }),
      onManageServerChange: (serverId: string) => editDraft({ serverId }),
      onManageNameChange: (name: string) => editDraft({ name }),
      onManageReasonChange: (reason: string) => editDraft({ reason }),
      onManageStatusChange: (status: string) => editDraft({ status }),
      onRemoveMember: (memberUserId: string) => {
        if (canManageGroup) removeMemberMutation.mutate({ groupId: selectedGroupId, memberUserId });
      },
      onSaveGroup: () => {
        if (canManageGroup)
          updateGroupMutation.mutate({
            groupId: selectedGroupId,
            name: groupNameDirty ? manageName : undefined,
            serverId: groupCategoryDirty ? manageServerId : undefined,
          });
      },
      onSaveWorkState: () => {
        if (canManageGroup)
          updateWorkStateMutation.mutate({
            groupId: selectedGroupId,
            status: manageStatus,
            reason: manageReason,
          });
      },
    },
  };
}
