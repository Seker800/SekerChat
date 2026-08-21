import { UploadKind } from '@prisma/client';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { FinalizedUploadResult, UploadSessionRecord } from './upload-session.types';

export const UPLOAD_TARGET_HANDLERS = Symbol('UPLOAD_TARGET_HANDLERS');

export class UploadSessionAlreadyFinalizedError extends Error {
  constructor() {
    super('Upload session has already been finalized.');
  }
}

export interface UploadTargetHandler {
  readonly kind: UploadKind;
  initiate(userId: string, dto: InitiateUploadDto): Promise<UploadSessionRecord>;
  prepareFinalization(session: UploadSessionRecord): Promise<unknown>;
  finalize(session: UploadSessionRecord, preparation: unknown): Promise<FinalizedUploadResult>;
  onFinalizationFailure?(
    session: UploadSessionRecord,
    error: unknown,
    context: { terminal: boolean; permanent: boolean },
  ): Promise<void>;
  /**
   * Atomically expires an initiated session together with target-owned bindings.
   * Returning false means another request already moved the session forward.
   */
  expireInitiatedSession?(
    session: Pick<UploadSessionRecord, 'id' | 'uploaderId'>,
    expiredAt: Date,
  ): Promise<boolean>;
  getFinalizedResult(session: UploadSessionRecord): Promise<FinalizedUploadResult>;
  afterCommit?(session: UploadSessionRecord, result: FinalizedUploadResult): Promise<void>;
}
