import { useCallback, useEffect, useState } from 'react';
import { isDndActive } from '@sekerchat/shared';
import { BROWSER_COOKIE_CREDENTIAL } from '../../lib/api-core';
import type { CurrentUserResponse } from '../../lib/auth-api';
import type { GroupResponse } from '../../lib/groups-api';
import { useNotification } from '../../hooks/useNotification';
import { useRealtime } from '../../hooks/useRealtime';

type WorkspaceRealtimeControllerOptions = {
  currentUser: CurrentUserResponse;
  groups: GroupResponse[];
  selectedGroupId: string;
  refreshGroupList: () => void;
};

export function useWorkspaceRealtimeController({
  currentUser,
  groups,
  selectedGroupId,
  refreshGroupList,
}: WorkspaceRealtimeControllerOptions) {
  const [dndOverride, setDndOverride] = useState<boolean | null>(null);
  const isDnd = dndOverride ?? isDndActive(currentUser.dndUntil);

  useEffect(() => setDndOverride(null), [currentUser.dndUntil]);

  const onPresenceChanged = useCallback(
    (event: { userId: string; online: boolean; isDnd: boolean }) => {
      if (event.userId === currentUser.id) setDndOverride(event.isDnd);
    },
    [currentUser.id],
  );
  const notification = useNotification(
    currentUser.id,
    isDnd,
    groups,
    selectedGroupId,
    refreshGroupList,
  );
  useRealtime(
    BROWSER_COOKIE_CREDENTIAL,
    selectedGroupId,
    currentUser.id,
    notification.handleMessageCreated,
    onPresenceChanged,
    notification.handleRealtimeRecovered,
  );

  return { isDnd, setDndOverride };
}
