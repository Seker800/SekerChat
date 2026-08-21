import { UPLOAD_PART_SIZE_BYTES } from './upload-limits';
import { UploadSessionRecord } from './upload-session.types';

export function presentUploadSession(session: UploadSessionRecord) {
  return {
    id: session.id,
    kind: session.kind,
    status: session.status,
    groupId: session.groupId,
    subscriptionAttachmentId: session.subscriptionAttachmentId,
    albumPhotoId: session.albumPhotoId,
    originalName: session.originalName,
    mimeType: session.mimeType,
    size: Number(session.size),
    multipartUploadId: session.multipartUploadId,
    partSizeBytes: UPLOAD_PART_SIZE_BYTES,
    createdAt: session.createdAt,
  };
}
