import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';

export function hasDraggedFiles(
  dataTransfer: Pick<DataTransfer, 'types'> | null | undefined,
): boolean {
  return Array.from(dataTransfer?.types ?? []).includes('Files');
}

export function isLocallyOwnedFileDrop(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-workspace-file-drop="local"]'));
}

export function useWorkspaceFileDrop(
  onPickAttachments: (files: File[]) => void,
  enabled = true,
) {
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  const onPickAttachmentsRef = useRef(onPickAttachments);
  onPickAttachmentsRef.current = onPickAttachments;

  useEffect(() => {
    dragCounterRef.current = 0;
    setIsFileDragActive(false);
    if (!enabled) return undefined;

    const onDragEnter = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (isLocallyOwnedFileDrop(event.target)) {
        dragCounterRef.current = 0;
        setIsFileDragActive(false);
        return;
      }
      event.preventDefault();
      dragCounterRef.current += 1;
      setIsFileDragActive(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (isLocallyOwnedFileDrop(event.target)) return;
      event.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsFileDragActive(false);
      }
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (isLocallyOwnedFileDrop(event.target)) {
        dragCounterRef.current = 0;
        setIsFileDragActive(false);
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (isLocallyOwnedFileDrop(event.target)) {
        dragCounterRef.current = 0;
        setIsFileDragActive(false);
        return;
      }
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsFileDragActive(false);
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, [enabled]);

  const clearFileDragState = useCallback(() => {
    dragCounterRef.current = 0;
    setIsFileDragActive(false);
  }, []);

  const handleMessageDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!enabled) return;
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      clearFileDragState();
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length > 0) onPickAttachmentsRef.current(files);
    },
    [clearFileDragState, enabled],
  );

  const handleMessageDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, [enabled]);

  return {
    isFileDragActive,
    clearFileDragState,
    handleMessageDrop,
    handleMessageDragOver,
  };
}
