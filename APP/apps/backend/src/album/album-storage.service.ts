import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { FilesService } from '../files/files.service';
import { ObjectStorageGateway } from '../files/object-storage.gateway';
import { createImageProcessor } from '../files/image-processing-policy';
import { PrismaService } from '../prisma/prisma.service';
import { AlbumMediaAccessService } from './album-media-access.service';
import { AlbumVideoService } from './album-video.service';

@Injectable()
export class AlbumStorageService {
  private readonly apiBaseUrl: string;
  constructor(
    config: ConfigService,
    private readonly files: FilesService,
    private readonly objects: ObjectStorageGateway,
    private readonly prisma: PrismaService,
    private readonly mediaAccess: AlbumMediaAccessService,
    @Optional() private readonly videos?: AlbumVideoService,
  ) {
    this.apiBaseUrl = config.getOrThrow<string>('API_BASE_URL');
  }
  buildStorageKey(now = new Date()) {
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `album/originals/${now.getUTCFullYear()}/${month}/${randomUUID()}`;
  }
  contentUrl(id: string) {
    return new URL(`/api/album/photos/${id}/content`, this.apiBaseUrl).toString();
  }
  thumbnailUrl(id: string) {
    return new URL(`/api/album/photos/${id}/thumbnail`, this.apiBaseUrl).toString();
  }
  signedContentUrl(id: string, storageKey: string, mimeType: string) {
    return this.withTicket(this.contentUrl(id), this.mediaAccess.issue(storageKey, mimeType));
  }
  signedThumbnailUrl(id: string, storageKey: string, mimeType: string) {
    return this.withTicket(this.thumbnailUrl(id), this.mediaAccess.issue(storageKey, mimeType));
  }
  async getStreamFromTicket(ticket: string, range?: string, ifNoneMatch?: string) {
    const media = this.mediaAccess.verify(ticket);
    return media ? { media, ...(await this.objects.get(media.key, { range, ifNoneMatch })) } : null;
  }
  getStream(key: string, range?: string, ifNoneMatch?: string) {
    return this.objects.get(key, { range, ifNoneMatch });
  }
  createViewUrl(key: string, mimeType: string) {
    return this.files.createPresignedViewUrl(key, mimeType);
  }
  async computeSha256(storageKey: string) {
    const { stream } = await this.objects.get(storageKey);
    const hash = createHash('sha256');
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest('hex');
  }
  async hashPhotoContent(photoId: string) {
    const photo = await this.prisma.albumPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, storageKey: true, sha256: true },
    });
    if (!photo || photo.sha256) return;
    const sha256 = await this.computeSha256(photo.storageKey);
    await this.prisma.albumPhoto.updateMany({
      where: { id: photo.id, sha256: null },
      data: { sha256 },
    });
  }
  async generateThumbnail(photoId: string, storageKey: string, mimeType: string) {
    const buffer =
      mimeType === 'video/mp4'
        ? await this.videos!.generatePoster(storageKey)
        : await this.generateImageThumbnail(storageKey);
    const thumbnailStorageKey = `album/thumbnails/${photoId}.jpg`;
    await this.objects.put(thumbnailStorageKey, buffer, 'image/jpeg');
    await this.prisma.albumPhoto.update({
      where: { id: photoId },
      data: { thumbnailStorageKey, thumbnailSize: buffer.length },
    });
  }

  async generateThumbnailForPhoto(photoId: string) {
    const photo = await this.prisma.albumPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        storageKey: true,
        thumbnailStorageKey: true,
        mimeType: true,
        deletedAt: true,
      },
    });
    if (!photo || photo.deletedAt || photo.thumbnailStorageKey) return;
    await this.generateThumbnail(photo.id, photo.storageKey, photo.mimeType);
  }

  async purgeDeletedPhoto(photoId: string) {
    const photo = await this.prisma.albumPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, storageKey: true, thumbnailStorageKey: true, deletedAt: true },
    });
    if (!photo) return;
    if (!photo.deletedAt) throw new Error('仍在使用的相册照片不能清理。');
    if (!(await this.objects.delete(photo.storageKey))) throw new Error('相册原图删除失败。');
    if (photo.thumbnailStorageKey && !(await this.objects.delete(photo.thumbnailStorageKey))) {
      throw new Error('相册缩略图删除失败。');
    }
    await this.prisma.albumPhoto.delete({ where: { id: photo.id } });
  }

  private withTicket(rawUrl: string, ticket: string) {
    const url = new URL(rawUrl);
    url.searchParams.set('mediaTicket', ticket);
    return url.toString();
  }

  private async generateImageThumbnail(storageKey: string): Promise<Buffer> {
    const { stream } = await this.objects.get(storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return createImageProcessor(Buffer.concat(chunks))
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }
}
