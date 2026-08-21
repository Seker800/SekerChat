import { useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../../auth/AuthContext';
import type { CurrentUserResponse } from '../../lib/auth-api';
import { updateUserProfile } from '../../lib/auth-api';
import { fetchOwnAttendanceStats, type AttendanceUserStats } from '../../lib/attendance-api';
import { uploadUserAvatar } from '../../lib/groups-api';
import { validateNewPassword } from '../../lib/password-policy';

type UserSettingsDialogState = {
  isOpen: boolean;
  initialMode: 'summary' | 'editDisplayName';
};

type UserSettingsDialogControllerOptions = {
  accessToken: string;
  currentUser: CurrentUserResponse;
  dialog: UserSettingsDialogState;
  onProfileUpdated?: () => void;
  onShowNotice?: (tone: 'success' | 'error', text: string) => void;
};

export function useUserSettingsDialogController({
  accessToken,
  currentUser,
  dialog,
  onProfileUpdated,
  onShowNotice,
}: UserSettingsDialogControllerOptions) {
  const auth = useOptionalAuth();
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [activityStats, setActivityStats] = useState<AttendanceUserStats | null>(null);
  const [activityError, setActivityError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (!dialog.isOpen) return;

    setIsEditingDisplayName(dialog.initialMode === 'editDisplayName');
    setDisplayName(currentUser.displayName || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordNotice(null);

    let cancelled = false;
    setActivityError('');
    fetchOwnAttendanceStats(accessToken)
      .then((stats) => {
        if (!cancelled) setActivityStats(stats);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setActivityStats(null);
        setActivityError(error instanceof Error ? error.message : '加载我的活跃度失败。');
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUser.displayName, dialog.initialMode, dialog.isOpen]);

  const changePassword = async () => {
    const policyError = validateNewPassword(newPassword);
    if (policyError) {
      setPasswordNotice({ tone: 'error', text: policyError });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ tone: 'error', text: '两次输入的新密码不一致。' });
      return;
    }
    if (!auth?.changeOwnPassword) {
      setPasswordNotice({ tone: 'error', text: '当前登录状态无法修改密码，请刷新后重试。' });
      return;
    }

    setIsChangingPassword(true);
    setPasswordNotice(null);
    try {
      await auth.changeOwnPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ tone: 'success', text: '密码已修改，其他设备的登录已失效。' });
    } catch (error) {
      setPasswordNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '修改密码失败。',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const saveAvatar = async (blob: Blob) => {
    setCropFile(null);
    try {
      await uploadUserAvatar(accessToken, blob);
      onProfileUpdated?.();
      onShowNotice?.('success', '头像已更新。');
    } catch (error) {
      onShowNotice?.('error', error instanceof Error ? error.message : '头像上传失败。');
    }
  };

  const saveDisplayName = async () => {
    const nextDisplayName = displayName.trim();
    setIsSavingDisplayName(true);
    try {
      await updateUserProfile(accessToken, { displayName: nextDisplayName });
      setDisplayName(nextDisplayName);
      setIsEditingDisplayName(false);
      onProfileUpdated?.();
      onShowNotice?.('success', '昵称已更新。');
    } catch (error) {
      onShowNotice?.('error', error instanceof Error ? error.message : '更新昵称失败。');
    } finally {
      setIsSavingDisplayName(false);
    }
  };

  return {
    avatarFileRef,
    cropFile,
    setCropFile,
    displayName,
    setDisplayName,
    isEditingDisplayName,
    setIsEditingDisplayName,
    isSavingDisplayName,
    activityStats,
    activityError,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    passwordNotice,
    isChangingPassword,
    changePassword,
    saveAvatar,
    saveDisplayName,
  };
}
