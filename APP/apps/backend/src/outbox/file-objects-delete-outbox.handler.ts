import { Injectable } from '@nestjs/common';
import type { OutboxEvent } from '@prisma/client';
import { ObjectStorageGateway } from '../files/object-storage.gateway';
import { OUTBOX_EVENT_TYPES } from './outbox.types';

@Injectable()
export class FileObjectsDeleteOutboxHandler {
  readonly eventType = OUTBOX_EVENT_TYPES.fileObjectsDeleteRequested;
  constructor(private readonly storage: ObjectStorageGateway) {}

  async handle(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !Array.isArray(payload.storageKeys) || !payload.storageKeys.length ||
      payload.storageKeys.some((key) => typeof key !== 'string' || !key || /^external-(images|files)\//.test(key))) {
      throw new Error('Invalid file deletion outbox payload.');
    }
    // Keys belong to retired FileObjects and are random, immutable upload keys.
    // A failed or interrupted deletion is safe to retry, including missing objects.
    for (const key of payload.storageKeys) {
      if (!(await this.storage.delete(key as string))) throw new Error('Object deletion failed.');
    }
  }
}
