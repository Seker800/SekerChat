import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconBell, IconBellOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { BROWSER_COOKIE_CREDENTIAL } from '../../lib/api-core';
import { updateGroupNotifications, type GroupResponse } from '../../lib/groups-api';
import styles from './GroupMuteButton.module.css';

export function GroupMuteButton({
  group,
  onError,
}: {
  group: GroupResponse;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const muted = group.notificationsMuted ?? false;
  const mutation = useMutation({
    mutationFn: (nextMuted: boolean) =>
      updateGroupNotifications(BROWSER_COOKIE_CREDENTIAL, group.id, nextMuted),
    onSuccess: (result) => {
      for (const key of ['groups', 'dms']) {
        queryClient.setQueryData<GroupResponse[]>([key], (current) =>
          current?.map((item) =>
            item.id === result.groupId
              ? { ...item, notificationsMuted: result.notificationsMuted }
              : item,
          ),
        );
      }
      queryClient.setQueryData<GroupResponse>(['group', result.groupId], (current) =>
        current ? { ...current, notificationsMuted: result.notificationsMuted } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['workspace-bootstrap'] });
    },
    onError: (error) =>
      onError(error instanceof Error ? error.message : t('groupNotifications.failed')),
  });
  const Icon = muted ? IconBellOff : IconBell;
  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={muted}
      aria-label={t(muted ? 'groupNotifications.unmute' : 'groupNotifications.mute')}
      title={t(muted ? 'groupNotifications.mutedHint' : 'groupNotifications.hint')}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!muted)}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{t(muted ? 'groupNotifications.muted' : 'groupNotifications.soundOn')}</span>
    </button>
  );
}
