import { Inject, Injectable } from '@nestjs/common';
import { UploadKind } from '@prisma/client';
import { UPLOAD_TARGET_HANDLERS, UploadTargetHandler } from './upload-target-handler';

@Injectable()
export class UploadTargetRegistry {
  private readonly handlers: ReadonlyMap<UploadKind, UploadTargetHandler>;

  constructor(@Inject(UPLOAD_TARGET_HANDLERS) handlers: UploadTargetHandler[]) {
    const entries = new Map<UploadKind, UploadTargetHandler>();
    for (const handler of handlers) {
      if (entries.has(handler.kind)) {
        throw new Error(`上传目标 ${handler.kind} 存在重复 handler。`);
      }
      entries.set(handler.kind, handler);
    }
    this.handlers = entries;
  }

  get(kind: UploadKind): UploadTargetHandler | undefined {
    return this.handlers.get(kind);
  }
}
