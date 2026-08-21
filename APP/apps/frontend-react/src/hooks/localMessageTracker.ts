import { useWorkspaceStore } from '../store/workspace-store';

/** Call right after a message is successfully sent from this browser tab. */
export function trackLocallySentMessage(messageId: string): void {
  useWorkspaceStore.getState().rememberLocallySentMessage(messageId);
  // Clean up after 30 s — the WebSocket event arrives within a few seconds at most.
  setTimeout(() => {
    useWorkspaceStore.getState().forgetLocallySentMessage(messageId);
  }, 30_000);
}

/** Call before the send API request fires, so the WebSocket handler can suppress notifications. */
export function trackSendingStart(groupId: string): void {
  useWorkspaceStore.getState().startPendingSend(groupId);
}

/** Call once the send resolves (success or error). */
export function trackSendingEnd(groupId: string): void {
  useWorkspaceStore.getState().finishPendingSend(groupId);
}

/** Returns true while any send is still in-flight from this tab. */
export function hasPendingSends(groupId?: string): boolean {
  return useWorkspaceStore.getState().hasPendingSends(groupId);
}
