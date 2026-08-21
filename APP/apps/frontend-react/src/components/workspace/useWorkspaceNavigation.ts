import { useCallback, useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { WorkspaceMode } from '../../store/workspace-store';

interface UseWorkspaceNavigationOptions {
  isNarrowViewport: boolean;
  isSecondarySurfaceViewport: boolean;
  mode: WorkspaceMode;
  navigate: NavigateFunction;
  setIsAuxSidebarOpen: (isOpen: boolean) => void;
  setIsMobileSidebarOpen: (isOpen: boolean) => void;
  setReplyToMessageId: (messageId: string) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
}

export function useWorkspaceNavigation({
  isNarrowViewport,
  isSecondarySurfaceViewport,
  mode,
  navigate,
  setIsAuxSidebarOpen,
  setIsMobileSidebarOpen,
  setReplyToMessageId,
  setWorkspaceMode,
}: UseWorkspaceNavigationOptions) {
  useEffect(() => {
    setWorkspaceMode(mode);
  }, [mode, setWorkspaceMode]);

  useEffect(() => {
    if (!isNarrowViewport) {
      setIsMobileSidebarOpen(false);
    }
  }, [isNarrowViewport, setIsMobileSidebarOpen]);

  useEffect(() => {
    if (!isSecondarySurfaceViewport) {
      setIsAuxSidebarOpen(false);
    }
  }, [isSecondarySurfaceViewport, setIsAuxSidebarOpen]);

  const navigateToGroup = useCallback((groupId: string, options: { keepMobileSidebarOpen?: boolean } = {}) => {
    if (!options.keepMobileSidebarOpen) {
      setIsMobileSidebarOpen(false);
    }

    setReplyToMessageId('');
    navigate(mode === 'dm' ? `/dm/${groupId}` : `/groups/${groupId}`);

  }, [mode, navigate, setIsMobileSidebarOpen, setReplyToMessageId]);

  return {
    closeAuxSidebar: () => setIsAuxSidebarOpen(false),
    closeMobileSidebar: () => setIsMobileSidebarOpen(false),
    navigateToGroup,
    openAuxSidebar: () => setIsAuxSidebarOpen(true),
    openMobileSidebar: () => setIsMobileSidebarOpen(true),
  };
}
