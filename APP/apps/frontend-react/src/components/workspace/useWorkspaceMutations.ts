import { useMutation, type UseQueryResult } from '@tanstack/react-query';
import {
  archiveServer,
  archiveGroup,
  createGroup,
  renameServer,
  updateGroup,
  type GroupResponse,
} from '../../lib/groups-api';
import { editMessage, type MessageResponse, revokeMessage } from '../../lib/messages-files-api';
import { setGroupWorkState, type GroupWorkStateResponse } from '../../lib/ops-api';
import type { WorkspaceMode } from '../../store/workspace-store';

interface UseWorkspaceMutationsOptions {
  accessToken: string;
  channelsQuery: Pick<UseQueryResult<GroupResponse[]>, 'refetch'>;
  createChannelInServerName: string;
  createChannelName: string;
  createServerName: string;
  mode: WorkspaceMode;
  navigateToGroup: (groupId: string, options?: { keepMobileSidebarOpen?: boolean }) => void;
  patchLoadedMessage: (message: MessageResponse) => void;
  pushNotice: (tone: 'success' | 'info' | 'error', text: string) => void;
  renameServerName: string;
  selectedServerId: string;
  selectedGroupId: string;
  selectedGroupQuery: Pick<UseQueryResult<GroupResponse>, 'refetch'>;
  serverDialogState: {
    mode: 'create' | 'settings';
    serverId: string;
    categoryName: string;
  } | null;
  serversQuery: Pick<UseQueryResult<GroupResponse[]>, 'refetch'>;
  setCreateChannelInServerName: (name: string) => void;
  setCreateChannelName: (name: string) => void;
  setCreateServerName: (name: string) => void;
  setIsCreateChannelDialogOpen: (isOpen: boolean) => void;
  setServerDialogState: (
    state: {
      mode: 'create' | 'settings';
      serverId: string;
      categoryName: string;
    } | null,
  ) => void;
  workStateQuery: Pick<UseQueryResult<GroupWorkStateResponse>, 'refetch'>;
}

export function useWorkspaceMutations({
  accessToken,
  channelsQuery,
  createChannelInServerName,
  createChannelName,
  createServerName,
  mode,
  navigateToGroup,
  patchLoadedMessage,
  pushNotice,
  renameServerName,
  selectedServerId,
  selectedGroupId,
  selectedGroupQuery,
  serverDialogState,
  serversQuery,
  setCreateChannelInServerName,
  setCreateChannelName,
  setCreateServerName,
  setIsCreateChannelDialogOpen,
  setServerDialogState,
  workStateQuery,
}: UseWorkspaceMutationsOptions) {
  const createServerMutation = useMutation({
    mutationFn: async () => {
      return createGroup(accessToken, {
        category: createServerName.trim(),
        name: createChannelName.trim(),
      });
    },
    onSuccess: async (group) => {
      setServerDialogState(null);
      setCreateServerName('');
      setCreateChannelName('');
      pushNotice('success', `已创建 server「${group.category}」和首个频道。`);
      await serversQuery.refetch();
      navigateToGroup(group.id);
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '新建 server 失败。');
    },
  });

  const renameServerMutation = useMutation({
    mutationFn: async () => {
      if (!serverDialogState?.serverId) {
        return null;
      }

      return renameServer(accessToken, serverDialogState.serverId, renameServerName.trim());
    },
    onSuccess: async (result) => {
      if (!result) {
        return;
      }

      setServerDialogState(null);
      pushNotice('success', `已将 server 改名为「${result.name}」。`);
      await serversQuery.refetch();
      await selectedGroupQuery.refetch();
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '修改 server 名字失败。');
    },
  });

  const archiveGroupMutation = useMutation({
    mutationFn: async ({ groupId, archive }: { groupId: string; archive: boolean }) => {
      return archiveGroup(accessToken, groupId, archive);
    },
    onSuccess: async (group) => {
      pushNotice(
        'success',
        group.archivedAt ? `已归档频道「${group.name}」。` : `已恢复频道「${group.name}」。`,
      );
      await channelsQuery.refetch();
      await selectedGroupQuery.refetch();
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '更新归档状态失败。');
    },
  });

  const archiveCategoryMutation = useMutation({
    mutationFn: async ({ serverId, archive }: { serverId: string; archive: boolean }) => {
      return archiveServer(accessToken, serverId, archive);
    },
    onSuccess: async (result) => {
      pushNotice(
        'success',
        result.archivedAt
          ? `已归档 Server「${result.category}」。`
          : `已恢复 Server「${result.category}」。`,
      );
      await serversQuery.refetch();
      await channelsQuery.refetch();
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '归档 Server 失败。');
    },
  });

  const setWorkStatusMutation = useMutation({
    mutationFn: async ({ groupId, status }: { groupId: string; status: string }) => {
      return setGroupWorkState(accessToken, groupId, { status });
    },
    onSuccess: async (result) => {
      pushNotice('success', `工作状态已更新为「${result.status}」。`);
      await channelsQuery.refetch();
      if (result.groupId === selectedGroupId) {
        await workStateQuery.refetch();
        await selectedGroupQuery.refetch();
      }
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '更新工作状态失败。');
    },
  });

  const createChannelMutation = useMutation({
    mutationFn: async () => {
      return createGroup(accessToken, {
        name: createChannelInServerName.trim(),
        serverId: selectedServerId,
      });
    },
    onSuccess: async (group) => {
      setIsCreateChannelDialogOpen(false);
      setCreateChannelInServerName('');
      pushNotice('success', `已创建频道「${group.name}」。`);
      await serversQuery.refetch();
      navigateToGroup(group.id);
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '新建频道失败。');
    },
  });

  const changeCategoryMutation = useMutation({
    mutationFn: async ({ groupId, serverId }: { groupId: string; serverId: string }) => {
      return updateGroup(accessToken, groupId, { serverId });
    },
    onSuccess: () => {
      void channelsQuery.refetch();
      void selectedGroupQuery.refetch();
      pushNotice('success', '已调整所属分类。');
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '调整所属分类失败。');
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, text }: { messageId: string; text: string }) => {
      return editMessage(accessToken, selectedGroupId, messageId, text);
    },
    onSuccess: (updatedMessage) => {
      patchLoadedMessage(updatedMessage);
      pushNotice('success', '消息已编辑。');
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '编辑消息失败。');
    },
  });

  const revokeMessageMutation = useMutation({
    mutationFn: async ({ messageId }: { messageId: string }) => {
      return revokeMessage(accessToken, selectedGroupId, messageId);
    },
    onSuccess: (updatedMessage) => {
      patchLoadedMessage(updatedMessage);
      pushNotice('success', '消息已撤回。');
    },
    onError(error) {
      pushNotice('error', error instanceof Error ? error.message : '撤回消息失败。');
    },
  });

  function onChangeCategory(groupId: string, serverId: string) {
    void changeCategoryMutation.mutateAsync({ groupId, serverId });
  }

  function onEditMessage(messageId: string, text: string) {
    void editMessageMutation.mutateAsync({ messageId, text });
  }

  function onRevokeMessage(messageId: string) {
    void revokeMessageMutation.mutateAsync({ messageId });
  }

  function onSetWorkStatus(groupId: string, status: string) {
    void setWorkStatusMutation.mutateAsync({ groupId, status });
  }

  return {
    archiveCategoryMutation,
    archiveGroupMutation,
    createChannelDialogState: {
      isSubmitting: createChannelMutation.isPending,
      onSubmit: () => {
        if (!createChannelInServerName.trim()) {
          pushNotice('error', '请填写频道名称。');
          return;
        }

        void createChannelMutation.mutateAsync();
      },
    },
    serverDialogState: {
      isSubmitting: createServerMutation.isPending || renameServerMutation.isPending,
      onSubmitCreate: () => {
        if (!createServerName.trim() || !createChannelName.trim()) {
          pushNotice('error', '请先填写 server 名称和首个频道名称。');
          return;
        }

        void createServerMutation.mutateAsync();
      },
      onSubmitRename: () => {
        if (!renameServerName.trim()) {
          pushNotice('error', '新的 server 名称不能为空。');
          return;
        }

        void renameServerMutation.mutateAsync();
      },
    },
    onChangeCategory: mode === 'server' ? onChangeCategory : () => undefined,
    onEditMessage,
    onRevokeMessage,
    onSetWorkStatus: mode === 'server' ? onSetWorkStatus : () => undefined,
  };
}
