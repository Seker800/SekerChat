import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';
import { OUTBOX_EVENT_TYPES } from '../outbox/outbox.types';

@Injectable()
export class FileRetirementService {
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService) {}

  async retire(fileId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // FK insertion takes a key-share lock on this row. FOR UPDATE serializes
      // a new attachment against the final reference check and row deletion.
      await tx.$queryRaw`SELECT id FROM "FileObject" WHERE id = ${fileId} FOR UPDATE`;
      const file = await tx.fileObject.findUnique({ where: { id: fileId }, include: { promotedArtifact: true } });
      if (!file || !file.storageKey || file.promotedArtifact) return false;
      // External objects have reusable content-addressed keys and reservation semantics.
      if (/^external-(images|files)\//.test(file.storageKey)) return false;
      if (!file.attachedAt && file.createdAt.getTime() > Date.now() - 24 * 60 * 60 * 1000) return false;
      if (await tx.message.count({ where: { OR: [{ attachmentFileId: fileId }, { externalAvatarFileId: fileId }] } })) return false;
      const share = await tx.fileShare.findUnique({ where: { fileId } });
      if (share && !share.revokedAt && share.expiresAt > new Date()) return false;
      await tx.outboxEvent.create({ data: {
        eventType: OUTBOX_EVENT_TYPES.fileObjectsDeleteRequested,
        aggregateType: 'FileObject', aggregateId: fileId,
        payload: { storageKeys: [file.storageKey, ...(file.thumbnailStorageKey ? [file.thumbnailStorageKey] : [])] },
      } });
      await tx.fileObject.delete({ where: { id: fileId } });
      return true;
    });
  }

  retireExternal(fileId: string): Promise<boolean> {
    return this.files.purgeUnreferencedExternalFile(fileId);
  }
}
