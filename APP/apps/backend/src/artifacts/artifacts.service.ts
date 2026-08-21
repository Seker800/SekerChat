import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { basename, extname } from 'node:path';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  isObjectRangeNotSatisfiableError,
  RangeNotSatisfiableException,
} from '../common/range-parser';
import { ArtifactRepository } from './artifact.repository';
import { ArtifactStorageService } from './artifact-storage.service';
import {
  AdminArtifactFilters,
  AdminArtifactRecord,
  ArtifactRecord,
  artifactSelect,
} from './artifact.types';
import { ArtifactWorkflowService } from './artifact-workflow.service';
import { PermissionService } from '../system-config/permission.service';
import { WorkStatusConfigService } from '../system-config/work-status-config.service';
export type UploadedArtifactFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type ArtifactWritableGroup = {
  id: string;
  name: string;
  createdAt: Date;
  archivedAt: Date | null;
  artifactsConfirmedAt: Date | null;
  artifactsConfirmedByUserId: string | null;
  workState: { status: string } | null;
};

@Injectable()
export class ArtifactsService {
  private readonly logger = new Logger(ArtifactsService.name);
  private readonly apiBaseUrl: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly repository: ArtifactRepository,
    private readonly storageService: ArtifactStorageService,
    private readonly workflowService: ArtifactWorkflowService,
    private readonly permissionService: PermissionService,
    private readonly filesService: FilesService,
    private readonly workStatusConfigService: WorkStatusConfigService,
  ) {
    this.apiBaseUrl =
      this.configService.get<string>('API_BASE_URL')?.trim() || 'http://localhost:3100';
  }

  async listArtifacts(userId: string, groupId: string) {
    await this.getReadableGroupOrThrow(groupId, userId);

    const artifacts = await this.repository.listByGroup(groupId);

    const results = await Promise.all(
      artifacts.map(async (artifact) => {
        const serialized = this.serializeArtifact(artifact);
        const fileExists = await this.checkArtifactExists(artifact);
        return { ...serialized, fileExists };
      }),
    );

    return results;
  }

  async listArtifactsForAdmin(actor: AuthenticatedUser, filters: AdminArtifactFilters = {}) {
    await this.ensureAdminArtifactAccess(actor);

    const artifacts = await this.repository.listForAdmin(filters);

    return Promise.all(
      artifacts.map(async (artifact) => ({
        ...this.serializeAdminArtifact(artifact),
        fileExists: await this.checkArtifactExists(artifact),
      })),
    );
  }

  async uploadArtifact(userId: string, groupId: string, file: UploadedArtifactFile) {
    const group = await this.getWritableGroupOrThrow(groupId, userId);

    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload file is required.');
    }

    const normalizedOriginalName = this.normalizeOriginalName(file.originalname);

    try {
      const existingArtifacts = await this.repository.listByGroupAscending(groupId);
      const storedName = this.resolveStoredName(normalizedOriginalName, existingArtifacts);
      const storageKey = this.storageService.buildStorageKey(groupId, storedName);

      await this.uploadBufferToStorage(
        storageKey,
        file.buffer,
        file.mimetype || 'application/octet-stream',
      );

      const artifactData = {
        groupId,
        uploaderId: userId,
        originalName: normalizedOriginalName,
        storedName,
        relativePath: this.storageService.serializeStorageKey(storageKey),
        mimeType: file.mimetype || 'application/octet-stream',
        size: BigInt(file.size),
      };
      const created = await this.repository.create(artifactData);

      await this.workflowService.recordArtifactUploaded(groupId, userId, normalizedOriginalName);

      this.logger.log(
        'group_artifact_uploaded',
        JSON.stringify({
          userId,
          groupId,
          artifactId: created.id,
          storedName: created.storedName,
        }),
      );

      return this.serializeArtifact(created);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error(
        'group_artifact_upload_failed',
        JSON.stringify({
          userId,
          groupId,
          originalName: normalizedOriginalName,
          error: error instanceof Error ? error.message : 'Unknown artifact upload error',
        }),
      );
      throw new ServiceUnavailableException('Artifact storage is unavailable.');
    }
  }

  async addFileToArtifacts(userId: string, groupId: string, fileId: string) {
    const group = await this.getWritableGroupOrThrow(groupId, userId);
    if (!(await this.workStatusConfigService.isPackagingStatus(group.workState?.status ?? ''))) {
      throw new BadRequestException('只有当前工作状态启用了打包能力，才能从消息添加产出。');
    }

    const existing = await this.repository.findBySourceFile(groupId, fileId);
    if (existing) {
      return this.serializeArtifact(existing);
    }

    const sourceFile = await this.filesService.assertAttachmentUsable(userId, groupId, fileId);
    const attachmentMessage = await this.prismaService.message.findFirst({
      where: { groupId, attachmentFileId: fileId, revokedAt: null },
      select: { id: true },
    });
    if (!attachmentMessage) {
      throw new BadRequestException('只能将已发送到消息的附件添加到产出。');
    }
    const normalizedOriginalName = this.normalizeOriginalName(sourceFile.originalName);
    const existingArtifacts = await this.repository.listByGroupAscending(groupId);
    const storedName = this.resolveStoredName(normalizedOriginalName, existingArtifacts);
    const storageKey = this.storageService.buildStorageKeyForSourceFile(
      groupId,
      fileId,
      storedName,
    );

    try {
      await this.storageService.copyFile(sourceFile.storageKey, storageKey);
      const created = await this.prismaService.$transaction(async (transaction) => {
        const concurrent = await this.repository.findBySourceFile(groupId, fileId, transaction);
        if (concurrent) {
          return concurrent;
        }

        const artifact = await this.repository.create(
          {
            groupId,
            uploaderId: userId,
            sourceFileId: fileId,
            originalName: normalizedOriginalName,
            storedName,
            relativePath: this.storageService.serializeStorageKey(storageKey),
            mimeType: sourceFile.mimeType,
            size: sourceFile.size,
          },
          transaction,
        );
        await this.workflowService.prepareArtifactUploaded(
          groupId,
          userId,
          normalizedOriginalName,
          transaction,
        );
        return artifact;
      });
      return this.serializeArtifact(created);
    } catch (error) {
      const concurrent = await this.repository.findBySourceFile(groupId, fileId).catch(() => null);
      if (concurrent) {
        return this.serializeArtifact(concurrent);
      }

      await this.storageService
        .deleteObject(this.storageService.serializeStorageKey(storageKey))
        .catch(() => false);
      this.logger.error(
        'group_artifact_copy_failed',
        JSON.stringify({
          userId,
          groupId,
          fileId,
          error: error instanceof Error ? error.message : 'Unknown artifact copy error',
        }),
      );
      throw new ServiceUnavailableException('无法将附件添加到产出，请稍后重试。');
    }
  }

  async getArtifactMetadata(userId: string, groupId: string, artifactId: string) {
    const artifact = await this.getReadableArtifactOrThrow(groupId, artifactId, userId);
    return this.serializeArtifact(artifact);
  }

  async getArtifactStream(userId: string, groupId: string, artifactId: string, range?: string) {
    const artifact = await this.getReadableArtifactOrThrow(groupId, artifactId, userId);
    return this.loadArtifactStreamOrThrow(artifact, { userId, groupId, artifactId }, range);
  }

  async getArtifactDownloadUrl(userId: string, groupId: string, artifactId: string) {
    const artifact = await this.getReadableArtifactOrThrow(groupId, artifactId, userId);
    const storageKey = this.storageService.extractStorageKey(artifact.relativePath);
    const url = await this.storageService.createArtifactDownloadUrl(
      storageKey,
      artifact.mimeType,
      artifact.originalName,
    );
    return { artifact, url };
  }

  async getArtifactDownloadUrlForAdmin(actor: AuthenticatedUser, artifactId: string) {
    await this.ensureAdminArtifactAccess(actor);
    const artifact = await this.getArtifactByIdOrThrow(artifactId);
    const storageKey = this.storageService.extractStorageKey(artifact.relativePath);
    const url = await this.storageService.createArtifactDownloadUrl(
      storageKey,
      artifact.mimeType,
      artifact.originalName,
    );
    return { artifact, url };
  }

  async getArtifactMetadataForAdmin(actor: AuthenticatedUser, artifactId: string) {
    await this.ensureAdminArtifactAccess(actor);
    const artifact = await this.getArtifactByIdOrThrow(artifactId);
    const detailed = await this.prismaService.groupArtifact.findUnique({
      where: { id: artifact.id },
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

    if (!detailed) {
      throw new NotFoundException('Artifact not found.');
    }

    return {
      ...this.serializeAdminArtifact(detailed),
      fileExists: await this.checkArtifactExists(detailed),
    };
  }

  async getArtifactStreamForAdmin(actor: AuthenticatedUser, artifactId: string, range?: string) {
    await this.ensureAdminArtifactAccess(actor);
    const artifact = await this.getArtifactByIdOrThrow(artifactId);
    return this.loadArtifactStreamOrThrow(
      artifact,
      { userId: actor.sub, groupId: artifact.groupId, artifactId },
      range,
    );
  }

  async readArtifactTextForGroup(groupId: string, artifactId: string): Promise<string> {
    const artifact = await this.prismaService.groupArtifact.findFirst({
      where: {
        id: artifactId,
        groupId,
      },
      select: artifactSelect,
    });

    if (!artifact) {
      throw new NotFoundException('Artifact not found.');
    }

    const { stream } = await this.loadArtifactStreamOrThrow(artifact, { groupId, artifactId });
    return this.readStreamAsUtf8(stream);
  }

  async deleteArtifact(actor: AuthenticatedUser, groupId: string, artifactId: string) {
    await this.permissionService.assertPermission(actor.role, 'manage_artifacts');

    await this.getWritableGroupOrThrow(groupId, actor.sub);
    const artifact = await this.getReadableArtifactOrThrow(groupId, artifactId, actor.sub);

    // Delete S3 object first — if this fails we still have the DB record to retry
    const deleted = await this.deleteStorageObject(artifact.relativePath);
    if (!deleted) {
      throw new ServiceUnavailableException('对象存储不可用，请稍后重试。');
    }

    // DB delete after S3: if this fails the S3 object is already gone.
    // Don't throw so the user doesn't retry against a missing S3 object;
    // log a critical error for manual cleanup of the orphaned DB record.
    try {
      await this.deleteArtifactRecord(artifact.id);
    } catch (dbError) {
      this.logger.error(
        'CRITICAL: artifact_db_delete_failed_after_s3_success',
        JSON.stringify({
          actorUserId: actor.sub,
          groupId,
          artifactId,
          relativePath: artifact.relativePath,
          error: dbError instanceof Error ? dbError.message : 'Unknown',
        }),
      );
      return {
        artifactId,
        deleted: true,
        warning: 'S3 对象已删除，但数据库记录删除失败，请联系管理员清理。',
      };
    }

    await this.workflowService.recordArtifactDeleted(groupId, actor.sub, artifact.originalName);

    this.logger.log(
      'group_artifact_deleted',
      JSON.stringify({
        actorUserId: actor.sub,
        groupId,
        artifactId,
      }),
    );

    return {
      artifactId,
      deleted: true,
    };
  }

  async confirmArtifacts(userId: string, groupId: string) {
    const group = await this.getWritableGroupOrThrow(groupId, userId);
    const artifactCount = await this.repository.countByGroup(groupId);
    if (artifactCount < 1) {
      throw new BadRequestException('当前还没有产出文件，无法确认。');
    }
    const updated = await this.prismaService.group.update({
      where: { id: group.id },
      data: {
        artifactsConfirmedAt: new Date(),
        artifactsConfirmedByUserId: userId,
      },
      select: {
        artifactsConfirmedAt: true,
        artifactsConfirmedByUserId: true,
      },
    });

    const actorName = await this.workflowService.recordArtifactsConfirmed(groupId, userId);

    return {
      isConfirmed: Boolean(updated.artifactsConfirmedAt),
      confirmedAt: updated.artifactsConfirmedAt,
      confirmedByUserId: updated.artifactsConfirmedByUserId,
      confirmedByDisplayName: updated.artifactsConfirmedByUserId ? actorName : null,
    };
  }

  async unlockArtifacts(userId: string, groupId: string) {
    const group = await this.getReadableGroupOrThrow(groupId, userId);

    if (group.archivedAt) {
      throw new BadRequestException('Archived group is read-only.');
    }

    if (!group.artifactsConfirmedAt) {
      return {
        isConfirmed: false,
        confirmedAt: null,
        confirmedByUserId: null,
        confirmedByDisplayName: null,
      };
    }

    await this.workflowService.recordArtifactsUnlocked(groupId, userId);

    return {
      isConfirmed: false,
      confirmedAt: null,
      confirmedByUserId: null,
      confirmedByDisplayName: null,
    };
  }

  async deleteArtifactForAdmin(actor: AuthenticatedUser, artifactId: string) {
    await this.ensureAdminArtifactAccess(actor);

    const artifact = await this.getArtifactByIdOrThrow(artifactId);
    const deleted = await this.deleteStorageObject(artifact.relativePath);
    if (!deleted) {
      throw new ServiceUnavailableException('对象存储不可用，请稍后重试。');
    }

    // DB delete after S3: if this fails the S3 object is already gone.
    try {
      await this.deleteArtifactRecord(artifact.id);
    } catch (dbError) {
      this.logger.error(
        'CRITICAL: admin_artifact_db_delete_failed_after_s3_success',
        JSON.stringify({
          actorUserId: actor.sub,
          artifactId,
          relativePath: artifact.relativePath,
          error: dbError instanceof Error ? dbError.message : 'Unknown',
        }),
      );
      return {
        artifactId,
        deleted: true,
        warning: 'S3 对象已删除，但数据库记录删除失败，请联系管理员清理。',
      };
    }

    this.logger.log(
      'admin_artifact_deleted',
      JSON.stringify({
        actorUserId: actor.sub,
        artifactId,
        groupId: artifact.groupId,
      }),
    );

    return {
      artifactId,
      deleted: true,
    };
  }

  private serializeArtifact(artifact: ArtifactRecord) {
    const displayOriginalName = this.normalizeOriginalName(artifact.originalName);
    const displayStoredName = this.normalizeOriginalName(artifact.storedName);
    const displayRelativePath = this.storageService
      .extractStorageKey(artifact.relativePath)
      .split('/')
      .map((segment) => this.normalizeOriginalName(segment))
      .join('/');

    return {
      id: artifact.id,
      groupId: artifact.groupId,
      uploaderId: artifact.uploaderId,
      originalName: displayOriginalName,
      storedName: displayStoredName,
      relativePath: displayRelativePath,
      mimeType: artifact.mimeType,
      size: Number(artifact.size),
      sourceFileId: artifact.sourceFileId ?? null,
      createdAt: artifact.createdAt,
      contentUrl: new URL(
        `/api/groups/${artifact.groupId}/artifacts/${artifact.id}/content`,
        this.apiBaseUrl,
      ).toString(),
      metadataUrl: new URL(
        `/api/groups/${artifact.groupId}/artifacts/${artifact.id}`,
        this.apiBaseUrl,
      ).toString(),
    };
  }

  private serializeAdminArtifact(artifact: AdminArtifactRecord) {
    return {
      ...this.serializeArtifact(artifact),
      groupName: artifact.group.name,
      groupCategory: artifact.group.server?.name ?? artifact.group.category,
      groupArchivedAt: artifact.group.archivedAt,
      groupWorkStatus: artifact.group.workState?.status ?? null,
      groupArtifactsConfirmed: Boolean(artifact.group.artifactsConfirmedAt),
      uploaderEmail: artifact.uploader.email,
      uploaderDisplayName: artifact.uploader.displayName,
    };
  }

  private async ensureAdminArtifactAccess(actor: AuthenticatedUser) {
    if (actor.role === 'SUPER_ADMIN') {
      return;
    }

    await this.permissionService.assertPermission(actor.role, 'view_admin_artifacts');
  }

  private async getArtifactByIdOrThrow(artifactId: string) {
    const artifact = await this.repository.findById(artifactId);

    if (!artifact) {
      throw new NotFoundException('Artifact not found.');
    }

    return artifact;
  }

  private async getReadableArtifactOrThrow(groupId: string, artifactId: string, userId: string) {
    await this.getReadableGroupOrThrow(groupId, userId);

    const artifact = await this.repository.findInGroup(groupId, artifactId);

    if (!artifact) {
      throw new NotFoundException('Artifact not found.');
    }

    return artifact;
  }

  private async getReadableGroupOrThrow(groupId: string, userId: string) {
    // Check if SUPER_ADMIN for bypass
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const membershipFilter = user?.role === 'SUPER_ADMIN' ? {} : { members: { some: { userId } } };

    const group = await this.prismaService.group.findFirst({
      where: {
        id: groupId,
        ...membershipFilter,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        archivedAt: true,
        artifactsConfirmedAt: true,
        artifactsConfirmedByUserId: true,
        workState: { select: { status: true } },
      },
    });

    if (!group) {
      this.logger.warn('group_artifact_access_denied', JSON.stringify({ userId, groupId }));
      throw new ForbiddenException('Group access denied.');
    }

    return group;
  }

  private async getWritableGroupOrThrow(groupId: string, userId: string) {
    const group = await this.getReadableGroupOrThrow(groupId, userId);

    if (group.archivedAt) {
      this.logger.warn(
        'group_artifact_write_denied',
        JSON.stringify({
          userId,
          groupId,
          reason: 'archived_group',
        }),
      );
      throw new BadRequestException('Archived group is read-only.');
    }

    if (group.artifactsConfirmedAt) {
      this.logger.warn(
        'group_artifact_write_denied',
        JSON.stringify({
          userId,
          groupId,
          reason: 'artifacts_confirmed',
        }),
      );
      throw new BadRequestException('当前产出已确认，请先解除确认再继续编辑。');
    }

    return group;
  }

  private resolveStoredName(originalName: string, existingArtifacts: ArtifactRecord[]) {
    const existingNames = new Set(
      existingArtifacts.map((artifact) => artifact.storedName.toLowerCase()),
    );
    if (!existingNames.has(originalName.toLowerCase())) {
      return originalName;
    }

    const extension = extname(originalName);
    const baseName = basename(originalName, extension);

    for (let index = 2; index < 10_000; index += 1) {
      const candidate = `${baseName} (${index})${extension}`;
      if (!existingNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }

    throw new BadRequestException('Could not allocate a unique artifact file name.');
  }

  private normalizeOriginalName(originalName: string) {
    const trimmed = originalName.trim();
    if (!trimmed) {
      return 'upload.bin';
    }

    const sanitized = trimmed.replace(/[\\/]+/g, '-');
    const decoded = Buffer.from(sanitized, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) {
      return sanitized;
    }

    const originalHasCjk = /[\u3400-\u9fff]/u.test(sanitized);
    const decodedHasCjk = /[\u3400-\u9fff]/u.test(decoded);
    const originalLooksMojibake = /[ÃÅÆÇÐÑØÞà-ÿ]/.test(sanitized);

    if (!originalHasCjk && (decodedHasCjk || originalLooksMojibake)) {
      return decoded;
    }

    return sanitized;
  }

  private async checkArtifactExists(artifact: ArtifactRecord) {
    try {
      return await this.storageService.exists(artifact.relativePath);
    } catch {
      return false;
    }
  }

  private async loadArtifactStreamOrThrow(
    artifact: ArtifactRecord,
    context: { userId?: string; groupId: string; artifactId: string },
    range?: string,
  ) {
    try {
      const { stream, contentLength, contentRange } = await this.storageService.getStream(
        artifact.relativePath,
        range,
      );
      return {
        artifact,
        stream,
        contentLength,
        contentRange,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown object storage read error';
      this.logger.error(
        'group_artifact_stream_failed',
        JSON.stringify({
          userId: context.userId ?? null,
          groupId: context.groupId,
          artifactId: context.artifactId,
          error: message,
        }),
      );
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Artifact content not found.');
      }
      if (range && isObjectRangeNotSatisfiableError(error)) {
        throw new RangeNotSatisfiableException(artifact.size);
      }
      throw new ServiceUnavailableException('对象存储不可用，请稍后重试。');
    }
  }

  private async readStreamAsUtf8(stream: NodeJS.ReadableStream) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  private async uploadBufferToStorage(storageKey: string, buffer: Buffer, mimeType: string) {
    await this.storageService.uploadBuffer(storageKey, buffer, mimeType);
  }

  private async deleteStorageObject(relativePath: string) {
    return this.storageService.deleteObject(relativePath);
  }

  private async deleteArtifactRecord(artifactId: string) {
    await this.repository.delete(artifactId);
  }
}
