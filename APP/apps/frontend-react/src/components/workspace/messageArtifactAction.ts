export interface MessageArtifactAction {
  isEnabled: boolean;
  isLocked: boolean;
  addedFileIds: ReadonlySet<string>;
  pendingFileIds: ReadonlySet<string>;
  onAdd: (fileId: string) => void;
}
