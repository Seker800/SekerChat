import { Prisma } from '@prisma/client';

export const fileObjectSelect = {
  id: true,
  groupId: true,
  storageKey: true,
  thumbnailStorageKey: true,
  thumbnailSize: true,
  imageWidth: true,
  imageHeight: true,
  originalName: true,
  mimeType: true,
  size: true,
  uploaderId: true,
  createdAt: true,
} satisfies Prisma.FileObjectSelect;

export type FileObjectRecord = Prisma.FileObjectGetPayload<{ select: typeof fileObjectSelect }>;
export type RenderableImageFileRecord = Pick<
  FileObjectRecord,
  'id' | 'groupId' | 'storageKey' | 'mimeType' | 'imageWidth' | 'imageHeight'
>;
