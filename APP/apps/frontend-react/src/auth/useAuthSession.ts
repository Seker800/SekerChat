import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '../store/workspace-store';
import { useSession } from '../hooks/useSession';

export function useAuthSession() {
  const auth = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (auth.isAuthenticated) {
      return;
    }

    queryClient.clear();
    useWorkspaceStore.getState().reset();
  }, [auth.isAuthenticated, queryClient]);

  return auth;
}
