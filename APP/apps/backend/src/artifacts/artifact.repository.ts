import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminArtifactFilters, artifactSelect } from './artifact.types';

@Injectable()
export class ArtifactRepository {
  constructor(private readonly prismaService: PrismaService) {}

  listByGroup(groupId: string) {
    return this.prismaService.groupArtifact.findMany({
      where: { groupId },
      orderBy: [{ createdAt: 'desc' }],
      select: artifactSelect,
    });
  }

  listByGroupAscending(groupId: string, transaction?: Prisma.TransactionClient) {
    return (transaction ?? this.prismaService).groupArtifact.findMany({
      where: { groupId },
      orderBy: [{ createdAt: 'asc' }],
      select: artifactSelect,
    });
  }

  listForAdmin(filters: AdminArtifactFilters = {}) {
    const where: Prisma.GroupArtifactWhereInput = {
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
      ...(filters.uploaderId ? { uploaderId: filters.uploaderId } : {}),
      ...(filters.groupWorkStatus
        ? { group: { workState: { is: { status: filters.groupWorkStatus } } } }
        : {}),
      ...(filters.packedState === 'packed'
        ? { group: { artifactsConfirmedAt: { not: null } } }
        : filters.packedState === 'unpacked'
          ? { group: { artifactsConfirmedAt: null } }
          : {}),
      ...(filters.query
        ? {
            OR: [
              { originalName: { contains: filters.query, mode: 'insensitive' } },
              { storedName: { contains: filters.query, mode: 'insensitive' } },
              { group: { name: { contains: filters.query, mode: 'insensitive' } } },
              { uploader: { email: { contains: filters.query, mode: 'insensitive' } } },
              { uploader: { displayName: { contains: filters.query, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    return this.prismaService.groupArtifact.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      select: {
        ...artifactSelect,
        group: {
          select: {
            id: true,
            name: true,
            category: true,
            server: { select: { name: true } },
            archivedAt: true,
            workState: {
              select: {
                status: true,
                updatedAt: true,
              },
            },
            artifactsConfirmedAt: true,
          },
        },
        uploader: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });
  }

  create(
    data: {
      groupId: string;
      uploaderId: string;
      originalName: string;
      storedName: string;
      relativePath: string;
      mimeType: string;
      size: bigint;
      sourceFileId?: string | null;
    },
    transaction?: Prisma.TransactionClient,
  ) {
    return (transaction ?? this.prismaService).groupArtifact.create({
      data,
      select: artifactSelect,
    });
  }

  findById(artifactId: string) {
    return this.prismaService.groupArtifact.findUnique({
      where: { id: artifactId },
      select: artifactSelect,
    });
  }

  findInGroup(groupId: string, artifactId: string) {
    return this.prismaService.groupArtifact.findFirst({
      where: {
        id: artifactId,
        groupId,
      },
      select: artifactSelect,
    });
  }

  findBySourceFile(groupId: string, sourceFileId: string, transaction?: Prisma.TransactionClient) {
    return (transaction ?? this.prismaService).groupArtifact.findFirst({
      where: { groupId, sourceFileId },
      select: artifactSelect,
    });
  }

  countByGroup(groupId: string) {
    return this.prismaService.groupArtifact.count({ where: { groupId } });
  }

  delete(artifactId: string) {
    return this.prismaService.groupArtifact.delete({ where: { id: artifactId } });
  }
}
