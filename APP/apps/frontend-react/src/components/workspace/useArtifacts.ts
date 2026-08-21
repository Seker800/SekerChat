import { useMemo, useState } from 'react';
import {
  addFileToGroupArtifacts,
  confirmGroupArtifacts,
  deleteGroupArtifact,
  unlockGroupArtifacts,
} from '../../lib/messages-files-api';
import type { GroupArtifactResponse } from '../../lib/messages-files-api';
import type { GroupResponse } from '../../lib/groups-api';
import { uploadFileViaMultipart } from '../../lib/multipart-upload';

type ArtifactListItem = GroupArtifactResponse & {
  isOptimistic?: boolean;
  optimisticLabel?: string;
};

type ArtifactConfirmationState = {
  isConfirmed: boolean;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  confirmedByDisplayName: string | null;
};

interface UseArtifactsOptions {
  accessToken: string;
  selectedGroupId: string;
  selectedGroup?: GroupResponse;
  items: GroupArtifactResponse[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  refetchArtifacts: () => Promise<void>;
  refetchGroup: () => Promise<void>;
}

export function useArtifacts({
  accessToken,
  selectedGroupId,
  selectedGroup,
  items,
  onError,
  onSuccess,
  refetchArtifacts,
  refetchGroup,
}: UseArtifactsOptions) {
  const [isUploadingArtifact, setIsUploadingArtifact] = useState(false);
  const [isConfirmingArtifactState, setIsConfirmingArtifactState] = useState(false);
  const [pendingDeleteArtifactId, setPendingDeleteArtifactId] = useState('');
  const [pendingDeleteArtifactName, setPendingDeleteArtifactName] = useState('');
  const [pendingSourceFileIds, setPendingSourceFileIds] = useState<Set<string>>(new Set());
  const [optimisticUploads, setOptimisticUploads] = useState<ArtifactListItem[]>([]);
  const [optimisticConfirmation, setOptimisticConfirmation] =
    useState<ArtifactConfirmationState | null>(null);

  const serverArtifactConfirmation = selectedGroup?.artifactConfirmation ?? {
    isConfirmed: false,
    confirmedAt: null,
    confirmedByUserId: null,
    confirmedByDisplayName: null,
  };
  const artifactConfirmation = optimisticConfirmation ?? serverArtifactConfirmation;
  const isLocked = artifactConfirmation.isConfirmed;
  const visibleItems = useMemo(() => {
    const serverItems = items.filter((item) => item.id !== pendingDeleteArtifactId);
    return [...optimisticUploads, ...serverItems];
  }, [items, optimisticUploads, pendingDeleteArtifactId]);
  const hasArtifacts = visibleItems.length > 0;
  const canConfirm = isLocked || hasArtifacts;
  const sourceFileIds = useMemo(
    () => new Set(visibleItems.flatMap((item) => (item.sourceFileId ? [item.sourceFileId] : []))),
    [visibleItems],
  );

  const onAddFromMessage = async (fileId: string) => {
    if (isLocked) {
      onError('当前产出已确认，请先解除确认再继续编辑。');
      return;
    }
    if (sourceFileIds.has(fileId) || pendingSourceFileIds.has(fileId)) {
      return;
    }

    setPendingSourceFileIds((current) => new Set(current).add(fileId));
    try {
      await addFileToGroupArtifacts(accessToken, selectedGroupId, fileId);
      await refetchArtifacts();
      await refetchGroup();
      onSuccess('已添加到产出。');
    } catch (error) {
      onError(error instanceof Error ? error.message : '添加到产出失败。');
    } finally {
      setPendingSourceFileIds((current) => {
        const next = new Set(current);
        next.delete(fileId);
        return next;
      });
    }
  };

  const onDelete = async (artifactId: string) => {
    if (isLocked) {
      onError('当前产出已确认，请先解除确认再继续编辑。');
      return;
    }

    const targetArtifact = items.find((item) => item.id === artifactId);
    setPendingDeleteArtifactId(artifactId);
    setPendingDeleteArtifactName(targetArtifact?.originalName ?? '');
    try {
      await deleteGroupArtifact(accessToken, selectedGroupId, artifactId);
      await refetchArtifacts();
      await refetchGroup();
    } catch (error) {
      onError(error instanceof Error ? error.message : '删除产出文件失败。');
    } finally {
      setPendingDeleteArtifactId('');
      setPendingDeleteArtifactName('');
    }
  };

  const onPick = async (files: File[]) => {
    if (!files.length) {
      return;
    }

    if (isLocked) {
      onError('当前产出已确认，请先解除确认再继续编辑。');
      return;
    }

    setIsUploadingArtifact(true);
    const optimisticBatch = files.map((file, index) => ({
      id: `optimistic-upload-${Date.now()}-${index}`,
      groupId: selectedGroupId,
      uploaderId: selectedGroup?.createdById ?? 'current-user',
      originalName: file.name,
      storedName: file.name,
      relativePath: '',
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: new Date().toISOString(),
      contentUrl: '',
      metadataUrl: '',
      isOptimistic: true,
      optimisticLabel: '上传中',
    }));
    setOptimisticUploads((current) => [...optimisticBatch, ...current]);
    try {
      const failedNames: string[] = [];
      for (const file of files) {
        try {
          await uploadFileViaMultipart(
            accessToken,
            'ARTIFACT',
            selectedGroupId,
            file,
            () => undefined,
          );
        } catch {
          failedNames.push(file.name);
        }
      }
      await refetchArtifacts();
      await refetchGroup();
      if (failedNames.length > 0) {
        onError(
          failedNames.length === files.length
            ? '上传产出文件失败。'
            : `部分文件上传失败：${failedNames.join('、')}`,
        );
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : '上传产出文件失败。');
    } finally {
      setOptimisticUploads((current) =>
        current.filter((item) => !optimisticBatch.some((optimistic) => optimistic.id === item.id)),
      );
      setIsUploadingArtifact(false);
    }
  };

  const onToggleConfirmation = async () => {
    setIsConfirmingArtifactState(true);
    const nextConfirmation = isLocked
      ? {
          isConfirmed: false,
          confirmedAt: null,
          confirmedByUserId: null,
          confirmedByDisplayName: null,
        }
      : {
          isConfirmed: true,
          confirmedAt: new Date().toISOString(),
          confirmedByUserId: selectedGroup?.createdById ?? 'current-user',
          confirmedByDisplayName: '你',
        };
    setOptimisticConfirmation(nextConfirmation);
    try {
      if (isLocked) {
        await unlockGroupArtifacts(accessToken, selectedGroupId);
        onSuccess('已解除产出确认。');
      } else {
        await confirmGroupArtifacts(accessToken, selectedGroupId);
        onSuccess('已确认当前产出。');
      }
      await refetchArtifacts();
      await refetchGroup();
    } catch (error) {
      setOptimisticConfirmation(null);
      onError(
        error instanceof Error ? error.message : isLocked ? '解除产出确认失败。' : '确认产出失败。',
      );
    } finally {
      setOptimisticConfirmation(null);
      setIsConfirmingArtifactState(false);
    }
  };

  return {
    artifacts: {
      confirmation: artifactConfirmation,
      canConfirm,
      hasArtifacts,
      isConfirming: isConfirmingArtifactState,
      pendingDeleteArtifactId,
      pendingDeleteArtifactName,
      isLocked,
      isUploading: isUploadingArtifact,
      items: visibleItems,
      onDelete,
      onAddFromMessage,
      pendingSourceFileIds,
      sourceFileIds,
      onPick,
      onRefresh: refetchArtifacts,
      onToggleConfirmation,
    },
  };
}
