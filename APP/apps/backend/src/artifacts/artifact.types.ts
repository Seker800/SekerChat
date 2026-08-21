import { Prisma } from '@prisma/client';

export const artifactSelect = {
  id: true,
  groupId: true,
  uploaderId: true,
  originalName: true,
  storedName: true,
  relativePath: true,
  mimeType: true,
  size: true,
  sourceFileId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GroupArtifactSelect;

export type ArtifactRecord = Prisma.GroupArtifactGetPayload<{ select: typeof artifactSelect }>;
export type AdminArtifactRecord = Prisma.GroupArtifactGetPayload<{
  select: typeof artifactSelect & {
    group: {
      select: {
        id: true;
        name: true;
        category: true;
        server: { select: { name: true } };
        archivedAt: true;
        workState: {
          select: {
            status: true;
            updatedAt: true;
          };
        };
        artifactsConfirmedAt: true;
      };
    };
    uploader: {
      select: {
        id: true;
        email: true;
        displayName: true;
      };
    };
  };
}>;

export type AdminArtifactFilters = {
  query?: string;
  groupId?: string;
  uploaderId?: string;
  groupWorkStatus?: string;
  packedState?: 'packed' | 'unpacked';
};
