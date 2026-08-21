import { useEffect } from 'react';
import type { WorkspaceMode } from '../../store/workspace-store';

type GroupSelection = { id: string };

type WorkspaceSelectionRecoveryOptions = {
  mode: WorkspaceMode;
  isLoading: boolean;
  isServerGroupsLoading: boolean;
  isSelectedGroupFetching: boolean;
  isDmSpecialPage: boolean;
  groups: GroupSelection[];
  requestedGroupId: string;
  selectedGroupId: string;
  selectedGroup: GroupSelection | null | undefined;
  recoveryGroup: GroupSelection | null;
  navigateToGroup: (groupId: string) => void;
};

export function useWorkspaceSelectionRecovery(options: WorkspaceSelectionRecoveryOptions) {
  const missingRequestedConversation =
    !options.isDmSpecialPage &&
    Boolean(options.requestedGroupId) &&
    options.requestedGroupId !== options.selectedGroupId &&
    options.groups.length > 0;
  const isRecoveringRequestedSelection =
    !options.isLoading && !options.isSelectedGroupFetching && missingRequestedConversation;
  const isRecoveringServerSelection =
    options.mode === 'server' &&
    !options.isServerGroupsLoading &&
    !options.isSelectedGroupFetching &&
    options.groups.length > 0 &&
    !options.selectedGroup &&
    options.recoveryGroup !== null &&
    options.recoveryGroup.id !== options.selectedGroupId;

  useEffect(() => {
    if (isRecoveringServerSelection && options.recoveryGroup) {
      options.navigateToGroup(options.recoveryGroup.id);
    }
  }, [isRecoveringServerSelection, options.navigateToGroup, options.recoveryGroup]);

  useEffect(() => {
    if (isRecoveringRequestedSelection && options.selectedGroupId) {
      options.navigateToGroup(options.selectedGroupId);
    }
  }, [isRecoveringRequestedSelection, options.navigateToGroup, options.selectedGroupId]);

  return { isRecoveringRequestedSelection, isRecoveringServerSelection };
}
