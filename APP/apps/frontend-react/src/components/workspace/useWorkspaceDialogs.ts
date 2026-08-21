import { useEffect, useState } from 'react';
import type { CurrentUserResponse } from '../../lib/auth-api';

type Notice = { tone: 'success' | 'info' | 'error'; text: string };
type UserSettingsInitialMode = 'summary' | 'editDisplayName';

interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  isDanger?: boolean;
  onConfirm: () => void;
}

interface UseWorkspaceDialogsOptions {
  currentUser: CurrentUserResponse;
}

export function useWorkspaceDialogs({ currentUser }: UseWorkspaceDialogsOptions) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isChannelDialogOpen, setIsChannelDialogOpen] = useState(false);
  const [serverDialogState, setServerDialogState] = useState<{
    mode: 'create' | 'settings';
    serverId: string;
    categoryName: string;
  } | null>(null);
  const [createServerName, setCreateServerName] = useState('');
  const [createChannelName, setCreateChannelName] = useState('');
  const [renameServerName, setRenameServerName] = useState('');
  const [memberDialogUserId, setMemberDialogUserId] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [userSettingsInitialMode, setUserSettingsInitialMode] =
    useState<UserSettingsInitialMode>('summary');
  const [isStartDMDialogOpen, setIsStartDMDialogOpen] = useState(false);
  const [isCreateChannelDialogOpen, setIsCreateChannelDialogOpen] = useState(false);
  const [createChannelInServerName, setCreateChannelInServerName] = useState('');

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [notice]);

  const pushNotice = (tone: Notice['tone'], text: string) => {
    setNotice({ tone, text });
  };

  return {
    channelDialog: {
      isOpen: isChannelDialogOpen,
      onClose: () => setIsChannelDialogOpen(false),
    },
    confirmDialog,
    confirmDialogModel: {
      isOpen: Boolean(confirmDialog),
      title: confirmDialog?.title ?? '',
      description: confirmDialog?.description ?? '',
      confirmLabel: confirmDialog?.confirmLabel ?? '',
      isDanger: confirmDialog?.isDanger,
      onClose: () => setConfirmDialog(null),
      onConfirm: () => confirmDialog?.onConfirm(),
    },
    createChannelInServerName,
    createChannelName,
    createServerName,
    isCreateChannelDialogOpen,
    isStartDMDialogOpen,
    closeMemberDialog: () => setMemberDialogUserId(''),
    currentUserId: currentUser.id,
    memberDialogUserId,
    notice,
    openMemberDialog: (memberUserId: string) => setMemberDialogUserId(memberUserId),
    openServerCreateDialog: () => {
      setCreateServerName('');
      setCreateChannelName('');
      setServerDialogState({ mode: 'create', serverId: '', categoryName: '' });
    },
    openServerSettingsDialog: (server: { id: string; name: string }) => {
      setRenameServerName(server.name);
      setServerDialogState({ mode: 'settings', serverId: server.id, categoryName: server.name });
    },
    openUserSettings: (initialMode: UserSettingsInitialMode = 'summary') => {
      setUserSettingsInitialMode(initialMode);
      setIsUserSettingsOpen(true);
    },
    renameServerName,
    serverDialogState,
    setConfirmDialog,
    setCreateChannelInServerName,
    setCreateChannelName,
    setCreateServerName,
    setIsChannelDialogOpen,
    setIsCreateChannelDialogOpen,
    setIsStartDMDialogOpen,
    setRenameServerName,
    setServerDialogState,
    showCopiedNotice: (text: string) => pushNotice('success', text),
    showErrorNotice: (text: string) => pushNotice('error', text),
    showInfoNotice: (text: string) => pushNotice('info', text),
    userSettingsDialog: {
      isOpen: isUserSettingsOpen,
      initialMode: userSettingsInitialMode,
      onClose: () => setIsUserSettingsOpen(false),
    },
    pushNotice,
  };
}
