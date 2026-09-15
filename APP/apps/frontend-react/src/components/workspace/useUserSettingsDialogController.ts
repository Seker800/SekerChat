import { useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../../auth/AuthContext';
import type { CurrentUserResponse } from '../../lib/auth-api';
import { updateUserProfile } from '../../lib/auth-api';
import { fetchOwnAttendanceStats, type AttendanceUserStats } from '../../lib/attendance-api';
import { uploadUserAvatar } from '../../lib/groups-api';
import { validateNewPassword } from '../../lib/password-policy';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
        setActivityError(error instanceof Error ? error.message : t('account.activityLoadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUser.displayName, dialog.initialMode, dialog.isOpen, t]);

  const changePassword = async () => {
    const policyError = validateNewPassword(newPassword);
    if (policyError) {
      setPasswordNotice({ tone: 'error', text: policyError });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ tone: 'error', text: t('account.passwordMismatch') });
      return;
    }
    if (!auth?.changeOwnPassword) {
      setPasswordNotice({ tone: 'error', text: t('account.passwordUnavailable') });
      return;
    }

    setIsChangingPassword(true);
    setPasswordNotice(null);
    try {
      await auth.changeOwnPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ tone: 'success', text: t('account.passwordChanged') });
    } catch (error) {
      setPasswordNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('account.passwordChangeFailed'),
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
      onShowNotice?.('success', t('account.avatarUpdated'));
    } catch (error) {
      onShowNotice?.('error', error instanceof Error ? error.message : t('account.avatarUploadFailed'));
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
      onShowNotice?.('success', t('account.displayNameUpdated'));
    } catch (error) {
      onShowNotice?.('error', error instanceof Error ? error.message : t('account.displayNameUpdateFailed'));
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
