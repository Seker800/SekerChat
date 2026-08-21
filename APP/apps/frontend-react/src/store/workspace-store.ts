import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export {
  DM_ATTENDANCE_PAGE_ID,
  DM_ATTENDANCE_ROUTE,
  DM_ALBUM_PAGE_ID,
  DM_ALBUM_ROUTE,
  DM_SUBSCRIPTION_PAGE_ID,
  DM_SUBSCRIPTION_ROUTE,
} from './dm-special-pages';

export type WorkspaceMode = 'server' | 'dm';

interface WorkspaceStore {
  workspaceMode: WorkspaceMode;
  replyToMessageId: string;
  composerSeedText: string;
  hiddenDmIds: string[];
  pendingSendCounts: Record<string, number>;
  locallySentMessageIds: Record<string, true>;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setReplyToMessageId: (messageId: string) => void;
  setComposerSeedText: (text: string) => void;
  hideDm: (dmId: string) => void;
  unhideDm: (dmId: string) => void;
  rememberLocallySentMessage: (messageId: string) => void;
  forgetLocallySentMessage: (messageId: string) => void;
  hasLocallySentMessage: (messageId: string) => boolean;
  startPendingSend: (groupId: string) => void;
  finishPendingSend: (groupId: string) => void;
  hasPendingSends: (groupId?: string) => boolean;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaceMode: 'server',
      replyToMessageId: '',
      composerSeedText: '',
      hiddenDmIds: [],
      pendingSendCounts: {},
      locallySentMessageIds: {},
      setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
      setReplyToMessageId: (replyToMessageId) => set({ replyToMessageId }),
      setComposerSeedText: (composerSeedText) => set({ composerSeedText }),
      hideDm: (dmId) => set((state) => ({ hiddenDmIds: [...state.hiddenDmIds, dmId] })),
      unhideDm: (dmId) =>
        set((state) => ({ hiddenDmIds: state.hiddenDmIds.filter((id) => id !== dmId) })),
      rememberLocallySentMessage: (messageId) =>
        set((state) => ({
          locallySentMessageIds: { ...state.locallySentMessageIds, [messageId]: true },
        })),
      forgetLocallySentMessage: (messageId) =>
        set((state) => {
          const next = { ...state.locallySentMessageIds };
          delete next[messageId];
          return { locallySentMessageIds: next };
        }),
      hasLocallySentMessage: (messageId) => Boolean(get().locallySentMessageIds[messageId]),
      startPendingSend: (groupId) =>
        set((state) => ({
          pendingSendCounts: {
            ...state.pendingSendCounts,
            [groupId]: (state.pendingSendCounts[groupId] ?? 0) + 1,
          },
        })),
      finishPendingSend: (groupId) =>
        set((state) => {
          const currentCount = state.pendingSendCounts[groupId] ?? 0;
          if (currentCount <= 1) {
            const next = { ...state.pendingSendCounts };
            delete next[groupId];
            return { pendingSendCounts: next };
          }

          return {
            pendingSendCounts: {
              ...state.pendingSendCounts,
              [groupId]: currentCount - 1,
            },
          };
        }),
      hasPendingSends: (groupId) => {
        const counts = get().pendingSendCounts;
        if (groupId) {
          return (counts[groupId] ?? 0) > 0;
        }

        return Object.values(counts).some((count) => count > 0);
      },
      reset: () =>
        set({
          hiddenDmIds: [],
          replyToMessageId: '',
          composerSeedText: '',
          pendingSendCounts: {},
          locallySentMessageIds: {},
        }),
    }),
    {
      name: 'sekerchat-workspace',
      partialize: (state) => ({ hiddenDmIds: state.hiddenDmIds }),
    },
  ),
);
