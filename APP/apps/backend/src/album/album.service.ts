import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../system-config/permission.service';
import { decodeAlbumCursor, encodeAlbumCursor } from './album-cursor';
import { normalizeAlbumTag, normalizeAlbumTags } from './album-policy';
import { AlbumStorageService } from './album-storage.service';

@Injectable()
export class AlbumService {
  private readonly purgeDelayMs = 7 * 24 * 60 * 60 * 1000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly storage: AlbumStorageService,
  ) {}

  async getUpdateStatus(actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const [state, readState, user] = await Promise.all([
        transaction.albumState.findUnique({ where: { id: 1 }, select: { revision: true } }),
        transaction.albumReadState.findUnique({
          where: { userId: actor.sub },
          select: { seenRevision: true },
        }),
        transaction.user.findUniqueOrThrow({
          where: { id: actor.sub },
          select: { createdAt: true },
        }),
      ]);
      const currentRevision = state?.revision ?? 0n;
      if (!readState) {
        const accountBaseline = await transaction.albumPhoto.findFirst({
          where: { createdAt: { lte: user.createdAt } },
          orderBy: { revision: 'desc' },
          select: { revision: true },
        });
        const seenRevision = accountBaseline?.revision ?? 0n;
        await transaction.albumReadState.upsert({
          where: { userId: actor.sub },
          create: { userId: actor.sub, seenRevision },
          update: {},
        });
        if (seenRevision >= currentRevision) return { hasUpdates: false };
        const unseenPhoto = await transaction.albumPhoto.findFirst({
          where: {
            deletedAt: null,
            uploaderId: { not: actor.sub },
            revision: { gt: seenRevision },
          },
          select: { id: true },
        });
        return { hasUpdates: Boolean(unseenPhoto) };
      }
      if (readState.seenRevision >= currentRevision) return { hasUpdates: false };
      const unseenPhoto = await transaction.albumPhoto.findFirst({
        where: {
          deletedAt: null,
          uploaderId: { not: actor.sub },
          revision: { gt: readState.seenRevision },
        },
        select: { id: true },
      });
      return { hasUpdates: Boolean(unseenPhoto) };
    });
  }

  async markViewed(actor: AuthenticatedUser) {
    await this.prisma.$executeRaw`
      INSERT INTO "AlbumReadState" ("userId", "seenRevision", "createdAt", "updatedAt")
      VALUES (
        ${actor.sub},
        COALESCE((SELECT "revision" FROM "AlbumState" WHERE "id" = 1), 0),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId") DO UPDATE
      SET "seenRevision" = GREATEST(
        "AlbumReadState"."seenRevision",
        EXCLUDED."seenRevision"
      ),
      "updatedAt" = CURRENT_TIMESTAMP
    `;
    return { hasUpdates: false };
  }

  async listPhotos(options: { cursor?: string; limit?: number; tag?: string }) {
    const limit = Math.min(50, Math.max(1, options.limit ?? 30));
    const cursor = options.cursor ? decodeAlbumCursor(options.cursor) : null;
    const tag = options.tag?.trim() ? normalizeAlbumTag(options.tag) : null;
    const where: Prisma.AlbumPhotoWhereInput = {
      deletedAt: null,
      ...(tag ? { tags: { some: { tag: { normalizedName: tag.normalizedName } } } } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.albumPhoto.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        width: true,
        height: true,
        createdAt: true,
        storageKey: true,
        thumbnailStorageKey: true,
        mimeType: true,
        durationMs: true,
      },
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      items: page.map((photo) => this.serializePhoto(photo)),
      nextCursor: hasMore && page.length ? encodeAlbumCursor(page.at(-1)!) : null,
    };
  }

  async listTags() {
    const rows = await this.prisma.albumTag.findMany({
      where: { photoCount: { gt: 0 } },
      orderBy: { normalizedName: 'asc' },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        photoCount: true,
      },
    });
    return rows.map((tag) => ({
      id: tag.id,
      name: tag.name,
      normalizedName: tag.normalizedName,
      photoCount: tag.photoCount,
    }));
  }

  async updateTags(actor: AuthenticatedUser, photoId: string, values: string[]) {
    await this.permissions.assertPermission(actor.role, 'manage_album');
    const names = normalizeAlbumTags(values);
    return this.prisma.$transaction(async (tx) => {
      const photo = await tx.albumPhoto.findFirst({
        where: { id: photoId, deletedAt: null },
        select: { id: true },
      });
      if (!photo) throw new NotFoundException('相册照片不存在。');
      const tags = [];
      for (const name of names) {
        const normalizedName = normalizeAlbumTag(name).normalizedName;
        tags.push(
          await tx.albumTag.upsert({
            where: { normalizedName },
            create: { name, normalizedName },
            update: {},
            select: { id: true, name: true, normalizedName: true },
          }),
        );
      }
      await tx.albumPhotoTag.deleteMany({ where: { photoId } });
      if (tags.length)
        await tx.albumPhotoTag.createMany({
          data: tags.map((tag) => ({ photoId, tagId: tag.id })),
        });
      return { photoId, tags };
    });
  }

  async getManagePhoto(actor: AuthenticatedUser, photoId: string) {
    await this.permissions.assertPermission(actor.role, 'manage_album');
    const photo = await this.getReadablePhoto(photoId);
    return {
      photoId: photo.id,
      tags: photo.tags.map(({ tag }) => ({
        id: tag.id,
        name: tag.name,
        normalizedName: tag.normalizedName,
      })),
    };
  }

  async softDelete(actor: AuthenticatedUser, photoId: string) {
    await this.permissions.assertPermission(actor.role, 'manage_album');
    const result = await this.prisma.$transaction(async (transaction) => {
      const deletedAt = new Date();
      const update = await transaction.albumPhoto.updateMany({
        where: { id: photoId, deletedAt: null },
        data: { deletedAt, deletedById: actor.sub },
      });
      if (update.count > 0) {
        await this.schedulePhotoPurge(transaction, photoId, deletedAt);
      }
      return update;
    });
    return { photoId, deleted: result.count > 0 };
  }

  async softDeleteMany(actor: AuthenticatedUser, photoIds: string[]) {
    await this.permissions.assertPermission(actor.role, 'manage_album');
    const uniquePhotoIds = [...new Set(photoIds)];
    const result = await this.prisma.$transaction(async (transaction) => {
      const activePhotos = await transaction.albumPhoto.findMany({
        where: { id: { in: uniquePhotoIds }, deletedAt: null },
        select: { id: true },
      });
      const activeIds = activePhotos.map((photo) => photo.id);
      if (!activeIds.length) return { count: 0 };
      const deletedAt = new Date();
      const update = await transaction.albumPhoto.updateMany({
        where: { id: { in: activeIds }, deletedAt: null },
        data: { deletedAt, deletedById: actor.sub },
      });
      await transaction.albumMediaJob.createMany({
        data: activeIds.map((id) => ({
          photoId: id,
          kind: 'PURGE_PHOTO',
          availableAt: new Date(deletedAt.getTime() + this.purgeDelayMs),
        })),
        skipDuplicates: true,
      });
      return update;
    });
    return { requestedCount: uniquePhotoIds.length, deletedCount: result.count };
  }

  async getReadablePhoto(photoId: string) {
    const photo = await this.prisma.albumPhoto.findFirst({
      where: { id: photoId, deletedAt: null },
      include: { tags: { include: { tag: true } } },
    });
    if (!photo) throw new NotFoundException('相册照片不存在。');
    return photo;
  }

  async getContent(photoId: string, range?: string) {
    const photo = await this.getReadablePhoto(photoId);
    return { photo, ...(await this.storage.getStream(photo.storageKey, range)) };
  }
  async getThumbnail(photoId: string, ifNoneMatch?: string, mediaTicket?: string) {
    if (mediaTicket) {
      try {
        const result = await this.storage.getStreamFromTicket(mediaTicket, undefined, ifNoneMatch);
        if (result) {
          return {
            photo: {
              mimeType: result.media.mimeType,
              thumbnailStorageKey: result.media.mimeType === 'image/jpeg' ? result.media.key : null,
            },
            ...result,
          };
        }
      } catch (error) {
        const objectError = error as Error & { $metadata?: { httpStatusCode?: number } };
        if (objectError.$metadata?.httpStatusCode === 304) {
          return {
            photo: { mimeType: 'image/jpeg', thumbnailStorageKey: 'signed' },
            notModified: true as const,
            etag: ifNoneMatch,
          };
        }
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    const photo = await this.getReadablePhoto(photoId);
    try {
      return {
        photo,
        ...(await this.storage.getStream(
          photo.thumbnailStorageKey ?? photo.storageKey,
          undefined,
          ifNoneMatch,
        )),
      };
    } catch (error) {
      const objectError = error as Error & {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (objectError.$metadata?.httpStatusCode === 304) {
        return { photo, notModified: true as const, etag: ifNoneMatch };
      }
      if (objectError.name === 'NoSuchKey' || objectError.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('相册照片内容不存在。');
      }
      throw new ServiceUnavailableException('对象存储不可用，请稍后重试。');
    }
  }
  async getViewUrl(photoId: string) {
    const photo = await this.getReadablePhoto(photoId);
    const url = await this.storage.createViewUrl(photo.storageKey, photo.mimeType);
    return {
      url,
      mimeType: photo.mimeType,
      size: Number(photo.size),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }
  serializePhoto(photo: {
    id: string;
    width: number;
    height: number;
    createdAt: Date;
    storageKey: string;
    thumbnailStorageKey: string | null;
    mimeType: string;
    durationMs: number | null;
  }) {
    const thumbnailUrl = photo.thumbnailStorageKey
      ? this.storage.signedThumbnailUrl(photo.id, photo.thumbnailStorageKey, 'image/jpeg')
      : photo.mimeType === 'video/mp4'
        ? null
        : this.storage.signedThumbnailUrl(photo.id, photo.storageKey, photo.mimeType);
    return {
      id: photo.id,
      mediaType: photo.mimeType === 'video/mp4' ? 'video' : 'image',
      mimeType: photo.mimeType,
      durationMs: photo.durationMs,
      width: photo.width,
      height: photo.height,
      createdAt: photo.createdAt,
      contentUrl: this.storage.contentUrl(photo.id),
      thumbnailUrl,
    };
  }

  private schedulePhotoPurge(
    transaction: Prisma.TransactionClient,
    photoId: string,
    deletedAt: Date,
  ) {
    return transaction.albumMediaJob.upsert({
      where: { photoId_kind: { photoId, kind: 'PURGE_PHOTO' } },
      create: {
        photoId,
        kind: 'PURGE_PHOTO',
        availableAt: new Date(deletedAt.getTime() + this.purgeDelayMs),
      },
      update: {
        status: 'PENDING',
        availableAt: new Date(deletedAt.getTime() + this.purgeDelayMs),
        lockedAt: null,
        completedAt: null,
        lastError: null,
      },
    });
  }
}
