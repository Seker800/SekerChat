import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionService } from '../system-config/permission.service';
import { ServersService } from '../servers/servers.service';

const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const AVATAR_EDGE_PX = 256;
const AVATAR_OUTPUT_MIME = 'image/webp';

@Injectable()
export class AvatarsService {
  private readonly apiBaseUrl: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
    private readonly permissionService: PermissionService,
    private readonly serversService: ServersService,
  ) {
    this.apiBaseUrl = this.configService.getOrThrow<string>('API_BASE_URL');
  }

  async uploadUserAvatar(userId: string, file: Express.Multer.File) {
    this.validateAvatarFile(file);
    const normalized = await this.normalizeAvatar(file);
    const storageKey = this.buildUserAvatarStorageKey(userId, normalized.mimeType);

    await this.filesService.uploadBufferToS3(storageKey, normalized.buffer, normalized.mimeType);

    await this.prismaService.user.update({
      where: { id: userId },
      data: { avatarStorageKey: storageKey },
    });

    return { avatarUrl: this.buildUserAvatarUrl(userId, storageKey) };
  }

  async getUserAvatarStream(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { avatarStorageKey: true },
    });
    if (!user?.avatarStorageKey) {
      throw new NotFoundException('User avatar not found.');
    }
    return this.filesService.getStreamFromS3(user.avatarStorageKey);
  }

  buildUserAvatarUrl(userId: string, storageKey?: string | null): string | null {
    if (!storageKey) return null;
    const url = new URL(`/api/avatars/users/${userId}/content`, this.apiBaseUrl);
    url.searchParams.set('v', storageKey);
    return url.toString();
  }

  async uploadServerAvatar(
    actor: AuthenticatedUser,
    categoryName: string,
    file: Express.Multer.File,
  ) {
    // Check the actor before ensureServerByName, which creates Server rows.
    await this.permissionService.assertPermission(actor.role, 'upload_server_avatar');
    const server = await this.serversService.ensureServerByName(categoryName);
    return this.uploadServerAvatarById(actor, server.id, file);
  }

  async uploadServerAvatarById(
    actor: AuthenticatedUser,
    serverId: string,
    file: Express.Multer.File,
  ) {
    await this.permissionService.assertPermission(actor.role, 'upload_server_avatar');
    this.validateAvatarFile(file);
    const server = await this.serversService.requireServer(serverId);
    const normalized = await this.normalizeAvatar(file);
    const storageKey = this.buildServerAvatarStorageKey(server.id, normalized.mimeType);

    await this.filesService.uploadBufferToS3(storageKey, normalized.buffer, normalized.mimeType);

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.server.update({
        where: { id: server.id },
        data: { avatarStorageKey: storageKey },
      });
      await transaction.category.upsert({
        where: { name: server.name },
        create: { name: server.name, avatarStorageKey: storageKey },
        update: { avatarStorageKey: storageKey, updatedAt: new Date() },
      });
    });

    if (server.avatarStorageKey && server.avatarStorageKey !== storageKey) {
      await this.filesService.deleteS3Object(server.avatarStorageKey);
    }

    return { avatarUrl: this.buildServerAvatarUrl(server.id, storageKey) };
  }

  async deleteServerAvatar(actor: AuthenticatedUser, categoryName: string) {
    const server = await this.serversService.findByName(categoryName);
    if (!server) return { avatarUrl: null };
    return this.deleteServerAvatarById(actor, server.id);
  }

  async deleteServerAvatarById(actor: AuthenticatedUser, serverId: string) {
    await this.permissionService.assertPermission(actor.role, 'upload_server_avatar');
    const server = await this.serversService.requireServer(serverId);

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.server.update({
        where: { id: server.id },
        data: { avatarStorageKey: null },
      });
      await transaction.category.updateMany({
        where: { name: server.name },
        data: { avatarStorageKey: null },
      });
    });

    if (server.avatarStorageKey) {
      await this.filesService.deleteS3Object(server.avatarStorageKey);
    }

    return { avatarUrl: null };
  }

  async getServerAvatarStream(categoryName: string) {
    const server = await this.serversService.findByName(categoryName);
    if (!server) throw new NotFoundException('Server avatar not found.');
    return this.getServerAvatarStreamById(server.id);
  }

  async getServerAvatarStreamById(serverId: string) {
    const server = await this.serversService.requireServer(serverId);
    if (!server.avatarStorageKey) {
      throw new NotFoundException('Server avatar not found.');
    }
    return this.filesService.getStreamFromS3(server.avatarStorageKey);
  }

  buildServerAvatarUrl(serverId: string, storageKey?: string | null): string | null {
    return this.serversService.buildAvatarUrl(serverId, storageKey);
  }

  buildLegacyServerAvatarUrl(categoryName: string, storageKey?: string | null): string | null {
    if (!storageKey) return null;
    const url = new URL(
      `/api/avatars/servers/${encodeURIComponent(categoryName)}/content`,
      this.apiBaseUrl,
    );
    url.searchParams.set('v', storageKey);
    return url.toString();
  }

  private buildUserAvatarStorageKey(userId: string, mimeType: string): string {
    const extension = this.getAvatarFileExtension(mimeType);
    return `avatars/users/${userId}/${randomUUID()}.${extension}`;
  }

  private buildServerAvatarStorageKey(serverId: string, mimeType: string): string {
    const extension = this.getAvatarFileExtension(mimeType);
    return `avatars/servers/${serverId}/${randomUUID()}.${extension}`;
  }

  private getAvatarFileExtension(mimeType: string): string {
    return mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] ?? 'bin');
  }

  private async normalizeAvatar(
    file: Express.Multer.File,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      const buffer = await sharp(file.buffer, { animated: false })
        .rotate()
        .resize(AVATAR_EDGE_PX, AVATAR_EDGE_PX, {
          fit: 'cover',
          position: 'centre',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
      return { buffer, mimeType: AVATAR_OUTPUT_MIME };
    } catch {
      throw new BadRequestException('无法处理头像图片，请换一张 PNG、JPEG 或 WebP。');
    }
  }

  private validateAvatarFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload file is required.');
    }
    if (file.size > MAX_AVATAR_SIZE) {
      throw new BadRequestException('Avatar file must be under 2 MB.');
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Avatar must be PNG, JPEG, or WebP.');
    }
  }
}
