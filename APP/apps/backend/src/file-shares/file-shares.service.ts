import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AvatarsService } from '../avatars/avatars.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { FileShareCredentialsService } from './file-share-credentials.service';
import { canManageFileShare } from './file-share-policy';
import { resolveFileShareStatus } from './file-share-state';
import { isManagedFileSharePassword } from './file-share-password-policy';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const DOWNLOAD_SESSION_MS = 15 * 60 * 1000;
const PUBLIC_SHARE_ERROR = '分享链接不可用或密码错误。';
const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const ACTIVATOR_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarStorageKey: true,
} satisfies Prisma.UserSelect;

type ShareInput = {
  password: string;
  expiresAt: string;
};

@Injectable()
export class FileSharesService {
  private readonly logger = new Logger(FileSharesService.name);
  private readonly appBaseUrl: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly credentials: FileShareCredentialsService,
    private readonly filesService: FilesService,
    private readonly avatarsService: AvatarsService,
    private readonly groupRealtimePublisher: GroupRealtimePublisher,
    configService: ConfigService,
  ) {
    this.appBaseUrl = configService.getOrThrow<string>('APP_BASE_URL');
  }

  async getManagedShare(actorId: string, groupId: string, fileId: string, now = new Date()) {
    const file = await this.getManageableFile(actorId, groupId, fileId);
    if (!file.share) {
      return {
        exists: false,
        fileId,
        fileName: file.originalName,
        password: this.credentials.generatePassword(),
        url: '',
        expiresAt: new Date(now.getTime() + THREE_DAYS_MS).toISOString(),
        status: 'DRAFT' as const,
        downloadCount: 0,
        lastDownloadedAt: null,
        activatedBy: null,
      };
    }

    return this.serializeManagedShare(file, file.share, now);
  }

  async upsertManagedShare(
    actorId: string,
    groupId: string,
    fileId: string,
    input: ShareInput,
    now = new Date(),
  ) {
    const file = await this.getManageableFile(actorId, groupId, fileId);
    const expiresAt = this.validateInput(input, now);
    const passwordHash = await this.credentials.hashPassword(input.password);
    const encryptedPassword = this.credentials.encryptPassword(input.password);

    const updateExistingShare = async (managedFile: typeof file) => {
      if (!managedFile.share) throw new NotFoundException('File share not found.');
      const reactivating = resolveFileShareStatus(
        {
          expiresAt: managedFile.share.expiresAt,
          revokedAt: managedFile.share.revokedAt,
          revokedReason: managedFile.share.revokedReason,
          groupArchivedAt: managedFile.group.archivedAt,
        },
        now,
      ) !== 'ACTIVE';
      const publicToken = reactivating ? this.credentials.generatePublicToken() : null;
      const share = await this.prismaService.fileShare.update({
        where: { id: managedFile.share.id },
        data: {
          creatorId: actorId,
          passwordHash,
          encryptedPassword,
          expiresAt,
          ...(publicToken
            ? {
                publicTokenHash: this.credentials.hashToken(publicToken),
                encryptedPublicToken: this.credentials.encryptPassword(publicToken),
              }
            : {}),
          revokedAt: null,
          revokedReason: null,
        },
        include: {
          creator: { select: ACTIVATOR_SELECT },
        },
      });
      await this.publishShareUpdated(actorId, groupId);
      return this.serializeManagedShare(managedFile, share, now);
    };

    if (file.share) {
      return updateExistingShare(file);
    }

    const publicToken = this.credentials.generatePublicToken();
    let share;
    try {
      share = await this.prismaService.fileShare.create({
        data: {
          fileId,
          creatorId: actorId,
          publicTokenHash: this.credentials.hashToken(publicToken),
          encryptedPublicToken: this.credentials.encryptPassword(publicToken),
          revokedAt: null,
          revokedReason: null,
          passwordHash,
          encryptedPassword,
          expiresAt,
        },
        include: {
          creator: { select: ACTIVATOR_SELECT },
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const concurrentFile = await this.getManageableFile(actorId, groupId, fileId);
      if (!concurrentFile.share) throw error;
      return this.serializeManagedShare(concurrentFile, concurrentFile.share, now);
    }
    await this.publishShareUpdated(actorId, groupId);
    return this.serializeManagedShare(file, share, now);
  }

  async rotateManagedShare(
    actorId: string,
    groupId: string,
    fileId: string,
    input: Pick<ShareInput, 'password'>,
    now = new Date(),
  ) {
    const file = await this.getManageableFile(actorId, groupId, fileId);
    if (!file.share) throw new NotFoundException('File share not found.');
    this.validatePassword(input.password);

    const publicToken = this.credentials.generatePublicToken();
    const passwordHash = await this.credentials.hashPassword(input.password);
    const encryptedPassword = this.credentials.encryptPassword(input.password);
    const share = await this.prismaService.fileShare.update({
      where: { id: file.share.id },
      data: {
        creatorId: actorId,
        publicTokenHash: this.credentials.hashToken(publicToken),
        encryptedPublicToken: this.credentials.encryptPassword(publicToken),
        passwordHash,
        encryptedPassword,
        revokedAt: null,
        revokedReason: null,
      },
      include: {
        creator: { select: ACTIVATOR_SELECT },
      },
    });
    await this.publishShareUpdated(actorId, groupId);
    return this.serializeManagedShare(file, share, now);
  }

  async revokeManagedShare(actorId: string, groupId: string, fileId: string, now = new Date()) {
    const file = await this.getManageableFile(actorId, groupId, fileId);
    if (!file.share) throw new NotFoundException('File share not found.');
    const share = await this.prismaService.fileShare.update({
      where: { id: file.share.id },
      data: { revokedAt: now, revokedReason: 'MANUAL' },
      include: {
        creator: { select: ACTIVATOR_SELECT },
      },
    });
    await this.publishShareUpdated(actorId, groupId);
    return this.serializeManagedShare(file, share, now);
  }

  private async publishShareUpdated(actorUserId: string, groupId: string): Promise<void> {
    try {
      await this.groupRealtimePublisher.publishGroupUpdated(groupId, {
        actorUserId,
        reason: 'file_share_updated',
      });
    } catch (error) {
      this.logger.warn(
        'file_share_realtime_publish_failed',
        JSON.stringify({
          actorUserId,
          groupId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
    }
  }

  async unlock(publicToken: string, password: string, now = new Date()) {
    const share = await this.findAvailablePublicShare(publicToken, now);
    const passwordMatches = await this.credentials.verifyPassword(
      password,
      share?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!share || !passwordMatches) {
      throw new UnauthorizedException(PUBLIC_SHARE_ERROR);
    }

    const sessionExpiresAt = new Date(now.getTime() + DOWNLOAD_SESSION_MS);
    return {
      shareId: share.id,
      fileName: share.file.originalName,
      mimeType: share.file.mimeType,
      size: share.file.size.toString(),
      session: this.credentials.createDownloadSession(
        share.id,
        sessionExpiresAt,
        share.publicTokenHash,
      ),
      sessionExpiresAt: sessionExpiresAt.toISOString(),
    };
  }

  async getPublicFileMetadata(shareId: string, session: string, now = new Date()) {
    const share = await this.getAvailableShareById(shareId, session, now);
    return {
      shareId: share.id,
      fileName: share.file.originalName,
      mimeType: share.file.mimeType,
      size: share.file.size,
    };
  }

  async getPublicFileContent(shareId: string, session: string, range?: string, now = new Date()) {
    const share = await this.getAvailableShareById(shareId, session, now);
    const content = await this.filesService.getStreamFromS3(share.file.storageKey, range);
    if (!range || /^bytes=0-/.test(range)) {
      void this.prismaService.fileShare
        .update({
          where: { id: share.id },
          data: { downloadCount: { increment: 1 }, lastDownloadedAt: now },
        })
        .catch((error: unknown) => {
          this.logger.warn(
            'file_share_download_statistics_update_failed',
            JSON.stringify({
              shareId: share.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          );
        });
    }
    return { ...content, fileName: share.file.originalName, size: share.file.size };
  }

  private async getManageableFile(actorId: string, groupId: string, fileId: string) {
    const file = await this.prismaService.fileObject.findFirst({
      where: { id: fileId, groupId },
      select: {
        id: true,
        uploaderId: true,
        originalName: true,
        mimeType: true,
        size: true,
        storageKey: true,
        group: {
          select: {
            id: true,
            isDM: true,
            archivedAt: true,
            members: {
              where: { userId: actorId },
              select: { role: true },
              take: 1,
            },
          },
        },
        share: {
          include: {
            creator: { select: ACTIVATOR_SELECT },
          },
        },
      },
    });

    if (!file) throw new NotFoundException('File not found.');
    if (
      !canManageFileShare({
        membershipRole: file.group.members[0]?.role ?? null,
        archivedAt: file.group.archivedAt,
      })
    ) {
      throw new ForbiddenException('You cannot manage this file share.');
    }
    return file;
  }

  private validateInput(input: ShareInput, now: Date): Date {
    this.validatePassword(input.password);
    const expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('Expiry must be a future date.');
    }
    return expiresAt;
  }

  private validatePassword(password: string): void {
    if (!isManagedFileSharePassword(password)) {
      throw new BadRequestException(
        'Password must be 12-64 letters and digits and include uppercase, lowercase, and a digit.',
      );
    }
  }

  private serializeManagedShare(file: any, share: any, now: Date) {
    const publicToken = this.credentials.decryptPassword(share.encryptedPublicToken);
    return {
      exists: true,
      id: share.id,
      fileId: file.id,
      fileName: file.originalName,
      password: this.credentials.decryptPassword(share.encryptedPassword),
      url: `${this.appBaseUrl.replace(/\/$/, '')}/s#t=${encodeURIComponent(publicToken)}`,
      expiresAt: share.expiresAt.toISOString(),
      status: resolveFileShareStatus(
        {
          expiresAt: share.expiresAt,
          revokedAt: share.revokedAt,
          revokedReason: share.revokedReason,
          groupArchivedAt: file.group.archivedAt,
        },
        now,
      ),
      downloadCount: share.downloadCount,
      lastDownloadedAt: share.lastDownloadedAt?.toISOString() ?? null,
      activatedBy: {
        id: share.creator.id,
        email: share.creator.email,
        displayName: share.creator.displayName,
        avatarUrl: this.avatarsService.buildUserAvatarUrl(
          share.creator.id,
          share.creator.avatarStorageKey,
        ),
      },
    };
  }

  private async findAvailablePublicShare(publicToken: string, now: Date) {
    const share = await this.prismaService.fileShare.findUnique({
      where: { publicTokenHash: this.credentials.hashToken(publicToken) },
      include: { file: { include: { group: true } } },
    });
    if (
      !share ||
      resolveFileShareStatus(
        {
          expiresAt: share.expiresAt,
          revokedAt: share.revokedAt,
          revokedReason: share.revokedReason,
          groupArchivedAt: share.file.group.archivedAt,
        },
        now,
      ) !== 'ACTIVE'
    )
      return null;
    return share;
  }

  private async getAvailableShareById(shareId: string, session: string, now: Date) {
    const share = await this.prismaService.fileShare.findUnique({
      where: { id: shareId },
      include: { file: { include: { group: true } } },
    });
    if (
      !share ||
      !this.credentials.verifyDownloadSession(session, shareId, now, share.publicTokenHash) ||
      resolveFileShareStatus(
        {
          expiresAt: share.expiresAt,
          revokedAt: share.revokedAt,
          revokedReason: share.revokedReason,
          groupArchivedAt: share.file.group.archivedAt,
        },
        now,
      ) !== 'ACTIVE'
    ) {
      throw new UnauthorizedException(PUBLIC_SHARE_ERROR);
    }
    return share;
  }
}
