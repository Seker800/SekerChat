import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionAttachmentStatus,
  SubscriptionAttachmentUsage,
  SubscriptionPostStatus,
  UploadKind,
  UploadSessionStatus,
} from '@prisma/client';
import { ALBUM_VIDEO_MAX_MB, MAX_CHAT_ATTACHMENT_MAX_MB } from '@sekerchat/shared';
import { Buffer } from 'node:buffer';
import { ArtifactRepository } from '../artifacts/artifact.repository';
import { ArtifactStorageService } from '../artifacts/artifact-storage.service';
import { ArtifactWorkflowService } from '../artifacts/artifact-workflow.service';
import { FilesService } from '../files/files.service';
import { createImageProcessor } from '../files/image-processing-policy';
import { ObjectSizeMismatchError } from '../files/object-size-mismatch.error';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadConfigService } from '../system-config/file-upload-config.service';
import { PermissionService } from '../system-config/permission.service';
import {
  assertSubscriptionAttachmentAllowed,
  isSubscriptionManagerRole,
} from '../subscriptions/subscription-policy';
import { SubscriptionStorageService } from '../subscriptions/subscription-storage.service';
import {
  uploadSessionSelect,
  type FinalizedUploadResult,
  type UploadSessionRecord,
} from './upload-session.types';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { UPLOAD_PART_SIZE_BYTES } from './upload-limits';
import { AlbumStorageService } from '../album/album-storage.service';
import { AlbumVideoService } from '../album/album-video.service';
import { UploadTargetRegistry } from './upload-target-registry';
import {
  UploadSessionAlreadyFinalizedError,
  type UploadTargetHandler,
} from './upload-target-handler';
import { presentUploadSession } from './upload-session.presenter';

const ALBUM_PHOTO_MAX_BYTES = 25n * 1024n * 1024n;
const ALBUM_VIDEO_MAX_BYTES = BigInt(ALBUM_VIDEO_MAX_MB) * 1024n * 1024n;
const ALBUM_IMAGE_MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.mp4', 'video/mp4'],
]);
const BUILT_IN_UPLOAD_KINDS = new Set<UploadKind>([
  UploadKind.CHAT_ATTACHMENT,
  UploadKind.ARTIFACT,
  UploadKind.SUBSCRIPTION_ATTACHMENT,
  UploadKind.ALBUM_PHOTO,
]);

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly artifactMaxUploadBytes = 10n * 1024n * 1024n * 1024n;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly filesService: FilesService,
    private readonly artifactRepository: ArtifactRepository,
    private readonly artifactStorageService: ArtifactStorageService,
    private readonly artifactWorkflowService: ArtifactWorkflowService,
    private readonly fileUploadConfigService: FileUploadConfigService,
    private readonly permissionService: PermissionService,
    private readonly subscriptionStorageService: SubscriptionStorageService,
    private readonly albumStorageService?: AlbumStorageService,
    private readonly albumVideoService?: AlbumVideoService,
    private readonly uploadTargets?: UploadTargetRegistry,
  ) {}

  async initiateUpload(userId: string, dto: InitiateUploadDto) {
    const targetHandler = this.uploadTargets?.get(dto.kind);
    if (targetHandler) {
      return presentUploadSession(await targetHandler.initiate(userId, dto));
    }
    if (!BUILT_IN_UPLOAD_KINDS.has(dto.kind)) {
      throw new ServiceUnavailableException('上传目标暂时不可用。');
    }
    if (dto.kind === UploadKind.ALBUM_PHOTO) return this.initiateAlbumUpload(userId, dto);
    if (dto.kind === UploadKind.SUBSCRIPTION_ATTACHMENT) {
      return this.initiateSubscriptionUpload(userId, dto);
    }
    if (!dto.groupId) {
      throw new BadRequestException('群组上传必须提供 groupId。');
    }
    const group = await this.getWritableGroupOrThrow(dto.groupId, userId, dto.kind);
    const normalizedOriginalName = this.normalizeOriginalName(dto.fileName);
    const sizeBigInt = BigInt(dto.size);
    await this.assertUploadAllowed(dto.kind, sizeBigInt);

    const objectKey =
      dto.kind === UploadKind.CHAT_ATTACHMENT
        ? this.filesService.buildDirectUploadStorageKey(group.id, normalizedOriginalName)
        : this.artifactStorageService.buildStorageKey(
            group.id,
            this.resolveArtifactStoredName(normalizedOriginalName),
          );

    const { uploadId } = await this.filesService.initiateMultipartUpload(
      objectKey,
      dto.mimeType || 'application/octet-stream',
    );

    try {
      const session = await this.prismaService.uploadSession.create({
        data: {
          kind: dto.kind,
          originalName: normalizedOriginalName,
          mimeType: dto.mimeType || 'application/octet-stream',
          size: sizeBigInt,
          objectKey,
          multipartUploadId: uploadId,
          uploaderId: userId,
          groupId: group.id,
        },
        select: uploadSessionSelect,
      });

      return presentUploadSession(session);
    } catch (error) {
      try {
        await this.filesService.abortMultipartUpload(objectKey, uploadId);
      } catch (abortError) {
        this.logger.error(
          'multipart_abort_failed_after_session_create_error',
          JSON.stringify({
            objectKey,
            error: abortError instanceof Error ? abortError.message : 'Unknown',
          }),
        );
      }
      throw error;
    }
  }

  private async initiateAlbumUpload(userId: string, dto: InitiateUploadDto) {
    if (dto.groupId || dto.postId) throw new BadRequestException('相册照片不能绑定群组或文章。');
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new ForbiddenException('用户不存在。');
    await this.permissionService.assertPermission(user.role, 'manage_album');
    const mimeType = this.resolveAlbumImageMimeType(dto.fileName, dto.mimeType);
    const isVideo = mimeType === 'video/mp4';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'].includes(mimeType)) {
      throw new BadRequestException('相册仅支持 JPEG、PNG、WebP、GIF 图片和 MP4 视频。');
    }
    const maxBytes = isVideo ? ALBUM_VIDEO_MAX_BYTES : ALBUM_PHOTO_MAX_BYTES;
    if (BigInt(dto.size) > maxBytes) {
      throw new BadRequestException(
        isVideo ? `相册视频大小不能超过 ${ALBUM_VIDEO_MAX_MB}MB。` : '相册照片大小不能超过 25MB。',
      );
    }
    const originalName = this.normalizeOriginalName(dto.fileName);
    const objectKey = this.albumStorageService!.buildStorageKey();
    const { uploadId } = await this.filesService.initiateMultipartUpload(objectKey, mimeType);
    try {
      const session = await this.prismaService.uploadSession.create({
        data: {
          kind: UploadKind.ALBUM_PHOTO,
          originalName,
          mimeType,
          size: BigInt(dto.size),
          objectKey,
          multipartUploadId: uploadId,
          uploaderId: userId,
        },
        select: uploadSessionSelect,
      });
      return presentUploadSession(session);
    } catch (error) {
      await this.filesService.abortMultipartUpload(objectKey, uploadId).catch(() => undefined);
      throw error;
    }
  }

  private async initiateSubscriptionUpload(userId: string, dto: InitiateUploadDto) {
    if (!dto.postId) {
      throw new BadRequestException('文章附件上传必须提供 postId。');
    }
    if (dto.groupId) {
      throw new BadRequestException('文章附件不能绑定群组。');
    }

    const [user, post] = await Promise.all([
      this.prismaService.user.findUnique({
        where: { id: userId },
        select: { role: true },
      }),
      this.prismaService.subscriptionPost.findUnique({
        where: { id: dto.postId },
        select: { id: true, status: true },
      }),
    ]);
    if (!user) {
      throw new ForbiddenException('用户不存在。');
    }
    if (!isSubscriptionManagerRole(user.role)) {
      throw new ForbiddenException('仅管理员可以管理文章。');
    }
    await this.permissionService.assertPermission(user.role, 'manage_subscription_posts');
    if (
      !post ||
      (post.status !== SubscriptionPostStatus.DRAFT &&
        post.status !== SubscriptionPostStatus.PUBLISHED)
    ) {
      throw new BadRequestException('只能向文章草稿或已发布文章上传附件。');
    }

    const normalizedOriginalName = this.normalizeOriginalName(dto.fileName);
    const sizeBigInt = BigInt(dto.size);
    const maxBytes = BigInt(await this.fileUploadConfigService.getSubscriptionAttachmentMaxBytes());
    assertSubscriptionAttachmentAllowed({
      attachmentCount: 0,
      sizeBytes: sizeBigInt,
      maxBytes,
    });

    const mimeType = dto.mimeType || 'application/octet-stream';
    const usage = dto.subscriptionUsage ?? SubscriptionAttachmentUsage.DOWNLOADABLE_FILE;
    if (usage === SubscriptionAttachmentUsage.INLINE_IMAGE && !mimeType.startsWith('image/')) {
      throw new BadRequestException('正文插图必须是图片文件。');
    }
    const objectKey = this.subscriptionStorageService.buildStorageKey(
      post.id,
      normalizedOriginalName,
    );
    const { uploadId } = await this.filesService.initiateMultipartUpload(objectKey, mimeType);

    try {
      const session = await this.prismaService.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "SubscriptionPost" WHERE "id" = ${post.id} FOR UPDATE`,
        );
        const lockedPost = await transaction.subscriptionPost.findUnique({
          where: { id: post.id },
          select: { status: true },
        });
        if (
          !lockedPost ||
          (lockedPost.status !== SubscriptionPostStatus.DRAFT &&
            lockedPost.status !== SubscriptionPostStatus.PUBLISHED)
        ) {
          throw new BadRequestException('只能向文章草稿或已发布文章上传附件。');
        }
        const attachmentCount = await transaction.subscriptionAttachment.count({
          where: { postId: post.id },
        });
        assertSubscriptionAttachmentAllowed({
          attachmentCount,
          sizeBytes: sizeBigInt,
          maxBytes,
        });

        const attachment = await transaction.subscriptionAttachment.create({
          data: {
            postId: post.id,
            uploaderId: userId,
            status: SubscriptionAttachmentStatus.UPLOADING,
            usage,
            storageKey: objectKey,
            originalName: normalizedOriginalName,
            mimeType,
            size: sizeBigInt,
          },
          select: { id: true },
        });
        return transaction.uploadSession.create({
          data: {
            kind: UploadKind.SUBSCRIPTION_ATTACHMENT,
            originalName: normalizedOriginalName,
            mimeType,
            size: sizeBigInt,
            objectKey,
            multipartUploadId: uploadId,
            uploaderId: userId,
            subscriptionAttachmentId: attachment.id,
          },
          select: uploadSessionSelect,
        });
      });
      return presentUploadSession(session);
    } catch (error) {
      await this.filesService.abortMultipartUpload(objectKey, uploadId).catch(() => undefined);
      throw error;
    }
  }

  async uploadPart(userId: string, sessionId: string, partNumber: number, body: Buffer) {
    if (!body.length) {
      throw new BadRequestException('上传分片不能为空。');
    }

    const session = await this.getActiveSessionOrThrow(sessionId, userId);
    const completed = await this.filesService.uploadMultipartPart(
      session.objectKey,
      session.multipartUploadId,
      partNumber,
      body,
    );

    return {
      uploadSessionId: session.id,
      partNumber: completed.PartNumber,
      etag: completed.ETag,
    };
  }

  async completeUpload(
    userId: string,
    sessionId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<FinalizedUploadResult> {
    const session = await this.getCompletableSessionOrThrow(sessionId, userId);
    if (session.status === UploadSessionStatus.COMPLETED) {
      return this.getFinalizedUploadResult(session);
    }
    const targetHandler = this.uploadTargets?.get(session.kind);
    if (!targetHandler && !BUILT_IN_UPLOAD_KINDS.has(session.kind)) {
      throw new ServiceUnavailableException('上传目标暂时不可用。');
    }
    if (parts.length < 1) {
      throw new BadRequestException('至少要提供一个分片。');
    }

    // ── integrity validation: verify parts cover the expected file ──
    const expectedPartCount = Math.max(1, Math.ceil(Number(session.size) / UPLOAD_PART_SIZE_BYTES));
    this.validatePartsCompleteness(parts, expectedPartCount);

    // ── complete S3 multipart upload (idempotent — recovers from prior partial completion) ──
    const sortedParts = parts
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((part) => ({
        PartNumber: part.partNumber,
        ETag: part.etag,
      }));

    await this.prismaService.uploadSession.updateMany({
      where: {
        id: session.id,
        status: {
          in: [
            UploadSessionStatus.INITIATED,
            UploadSessionStatus.ASSEMBLED,
            UploadSessionStatus.FAILED,
          ],
        },
      },
      data: {
        completionParts: parts.map((part) => ({
          partNumber: part.partNumber,
          etag: part.etag,
        })),
      },
    });

    try {
      await this.filesService.completeMultipartUpload(
        session.objectKey,
        session.multipartUploadId,
        sortedParts,
      );
    } catch (error) {
      // If a prior attempt already completed the multipart upload but the DB transaction
      // failed, the object exists in S3. Recover by checking whether the object is present.
      const alreadyExists = await this.filesService.hasS3Object(session.objectKey);
      if (!alreadyExists) {
        throw error;
      }
      this.logger.warn(
        'complete_multipart_recovered',
        `Object ${session.objectKey} already assembled — proceeding with DB finalization`,
      );
    }

    // From this point onward the multipart object exists. Persist that boundary before
    // reading it so a transient validation or database failure can be recovered safely.
    await this.prismaService.uploadSession.updateMany({
      where: {
        id: session.id,
        status: UploadSessionStatus.INITIATED,
      },
      data: {
        status: UploadSessionStatus.ASSEMBLED,
        assembledAt: new Date(),
        lastError: null,
      },
    });

    try {
      await this.filesService.assertObjectSize(session.objectKey, Number(session.size));
      await this.validateObjectMime(session.objectKey, session.mimeType);
    } catch (error) {
      this.logger.error(
        'assembled_object_validation_failed',
        JSON.stringify({
          objectKey: session.objectKey,
          expectedSize: Number(session.size),
          error: error instanceof Error ? error.message : 'Unknown',
        }),
      );
      const isPermanentValidationFailure =
        error instanceof ObjectSizeMismatchError || error instanceof BadRequestException;
      await this.prismaService.uploadSession.updateMany({
        where: {
          id: session.id,
          status: UploadSessionStatus.ASSEMBLED,
        },
        data: isPermanentValidationFailure
          ? {
              status: UploadSessionStatus.FAILED,
              finalizationAttempts: 10,
              lastError: error.message.slice(0, 2000),
            }
          : {
              lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown',
            },
      });
      await this.notifyTargetFinalizationFailure(
        targetHandler,
        session,
        error,
        isPermanentValidationFailure,
        isPermanentValidationFailure,
      );
      if (error instanceof BadRequestException) throw error;
      if (error instanceof ObjectSizeMismatchError) {
        throw new BadRequestException('文件上传完整性校验失败，请重新上传。');
      }
      throw new ServiceUnavailableException('对象存储暂时不可用，系统将自动重试。');
    }

    const subscriptionSha256 =
      session.kind === UploadKind.SUBSCRIPTION_ATTACHMENT
        ? await this.subscriptionStorageService.computeSha256(session.objectKey)
        : null;
    let albumSha256: string | null = null;
    let videoMetadata = null;
    if (session.kind === UploadKind.ALBUM_PHOTO) {
      try {
        if (session.mimeType === 'video/mp4') {
          const video = await this.albumVideoService!.inspectAndHash(session.objectKey);
          albumSha256 = video.sha256;
          videoMetadata = video;
        } else {
          albumSha256 = await this.albumStorageService!.computeSha256(session.objectKey);
        }
      } catch (error) {
        const isPermanentFailure = error instanceof BadRequestException;
        await this.prismaService.uploadSession.updateMany({
          where: {
            id: session.id,
            status: { in: [UploadSessionStatus.ASSEMBLED, UploadSessionStatus.FAILED] },
          },
          data: {
            status: UploadSessionStatus.FAILED,
            finalizationAttempts: isPermanentFailure ? 10 : { increment: 1 },
            lastError:
              error instanceof Error
                ? error.message.slice(0, 2_000)
                : 'Unknown preprocessing error',
          },
        });
        await this.notifyTargetFinalizationFailure(
          targetHandler,
          session,
          error,
          isPermanentFailure || session.finalizationAttempts + 1 >= 10,
          isPermanentFailure,
        );
        throw error;
      }
    }
    const imageDimensions =
      (session.kind === UploadKind.CHAT_ATTACHMENT || session.kind === UploadKind.ALBUM_PHOTO) &&
      session.mimeType.startsWith('image/') &&
      session.mimeType !== 'image/svg+xml'
        ? await this.filesService
            .getImageDimensionsFromS3Object(session.objectKey, session.mimeType)
            .catch((error) => {
              this.logger.warn(
                'image_metadata_extraction_failed_in_complete_upload',
                JSON.stringify({
                  objectKey: session.objectKey,
                  error: error instanceof Error ? error.message : 'Unknown',
                }),
              );
              return null;
            })
        : null;
    if (session.kind === UploadKind.ALBUM_PHOTO && !imageDimensions && !videoMetadata) {
      await this.prismaService.uploadSession.updateMany({
        where: { id: session.id, status: UploadSessionStatus.ASSEMBLED },
        data: {
          status: UploadSessionStatus.FAILED,
          finalizationAttempts: 10,
          lastError: '无法读取相册图片尺寸。',
        },
      });
      throw new BadRequestException('无法读取相册图片尺寸。');
    }
    let targetPreparation: unknown;
    if (targetHandler) {
      try {
        targetPreparation = await targetHandler.prepareFinalization(session);
      } catch (error) {
        const isPermanentFailure = error instanceof BadRequestException;
        await this.prismaService.uploadSession.updateMany({
          where: {
            id: session.id,
            status: { in: [UploadSessionStatus.ASSEMBLED, UploadSessionStatus.FAILED] },
          },
          data: {
            status: UploadSessionStatus.FAILED,
            finalizationAttempts: isPermanentFailure ? 10 : { increment: 1 },
            lastError:
              error instanceof Error
                ? error.message.slice(0, 2_000)
                : 'Unknown preprocessing error',
          },
        });
        await this.notifyTargetFinalizationFailure(
          targetHandler,
          session,
          error,
          isPermanentFailure || session.finalizationAttempts + 1 >= 10,
          isPermanentFailure,
        );
        throw error;
      }
    }

    // ── DB transaction with optimistic locking on recoverable assembled state ──
    type TransactionResult =
      | {
          kind: typeof UploadKind.CHAT_ATTACHMENT;
          createdFileObject: {
            id: string;
            groupId: string;
            originalName: string;
            mimeType: string;
            size: bigint;
            createdAt: Date;
            uploaderId: string;
            thumbnailStorageKey: string | null;
            imageWidth: number | null;
            imageHeight: number | null;
          };
        }
      | {
          kind: typeof UploadKind.ARTIFACT;
          createdArtifact: {
            id: string;
            groupId: string;
            uploaderId: string;
            originalName: string;
            storedName: string;
            relativePath: string;
            mimeType: string;
            size: bigint;
            createdAt: Date;
          };
        }
      | {
          kind: typeof UploadKind.SUBSCRIPTION_ATTACHMENT;
          attachment: {
            id: string;
            postId: string;
            uploaderId: string;
            originalName: string;
            mimeType: string;
            size: bigint;
            sha256: string | null;
            downloadCount: bigint;
            usage: SubscriptionAttachmentUsage;
            createdAt: Date;
          };
        }
      | {
          kind: typeof UploadKind.ALBUM_PHOTO;
          photo: { id: string; width: number; height: number; createdAt: Date };
          duplicate: boolean;
        }
      | {
          kind: 'REGISTERED_TARGET';
          finalized: FinalizedUploadResult;
        };

    let txResult: TransactionResult;
    try {
      if (targetHandler) {
        txResult = {
          kind: 'REGISTERED_TARGET',
          finalized: await targetHandler.finalize(session, targetPreparation),
        };
      } else {
        txResult = await this.prismaService.$transaction(async (transaction) => {
          // Optimistic lock: one request owns finalization at a time. A failed
          // transaction rolls this state change back to ASSEMBLED/FAILED.
          const updated = await transaction.uploadSession.updateMany({
            where: {
              id: session.id,
              status: {
                in: [UploadSessionStatus.ASSEMBLED, UploadSessionStatus.FAILED],
              },
            },
            data: {
              status: UploadSessionStatus.FINALIZING,
              finalizationStartedAt: new Date(),
              finalizationAttempts: { increment: 1 },
              lastError: null,
            },
          });

          if (updated.count === 0) {
            throw new UploadSessionAlreadyFinalizedError();
          }

          if (session.kind === UploadKind.CHAT_ATTACHMENT) {
            const created = await transaction.fileObject.create({
              data: {
                groupId: session.groupId!,
                uploaderId: session.uploaderId,
                storageKey: session.objectKey,
                originalName: session.originalName,
                mimeType: session.mimeType,
                size: session.size,
                imageWidth: imageDimensions?.width ?? null,
                imageHeight: imageDimensions?.height ?? null,
              },
              select: {
                id: true,
                groupId: true,
                originalName: true,
                mimeType: true,
                size: true,
                createdAt: true,
                uploaderId: true,
                thumbnailStorageKey: true,
                imageWidth: true,
                imageHeight: true,
              },
            });

            await transaction.uploadSession.update({
              where: { id: session.id },
              data: {
                status: UploadSessionStatus.COMPLETED,
                completedAt: new Date(),
                lastError: null,
              },
            });

            return {
              kind: UploadKind.CHAT_ATTACHMENT,
              createdFileObject: created,
            };
          }

          if (session.kind === UploadKind.SUBSCRIPTION_ATTACHMENT) {
            if (!session.subscriptionAttachmentId || !subscriptionSha256) {
              throw new BadRequestException('文章附件上传会话不完整。');
            }
            const attachment = await transaction.subscriptionAttachment.update({
              where: { id: session.subscriptionAttachmentId },
              data: {
                status: SubscriptionAttachmentStatus.READY,
                sha256: subscriptionSha256,
              },
              select: {
                id: true,
                postId: true,
                uploaderId: true,
                originalName: true,
                mimeType: true,
                size: true,
                sha256: true,
                downloadCount: true,
                usage: true,
                createdAt: true,
              },
            });
            await transaction.uploadSession.update({
              where: { id: session.id },
              data: {
                status: UploadSessionStatus.COMPLETED,
                completedAt: new Date(),
                lastError: null,
              },
            });
            return {
              kind: UploadKind.SUBSCRIPTION_ATTACHMENT,
              attachment,
            };
          }

          if (session.kind === UploadKind.ALBUM_PHOTO) {
            if (!albumSha256) throw new BadRequestException('无法计算相册图片哈希。');
            await transaction.$queryRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${albumSha256}, 0))::text AS "locked"`,
            );
            const duplicate = await transaction.albumPhoto.findFirst({
              where: { sha256: albumSha256, deletedAt: null },
              select: { id: true, width: true, height: true, createdAt: true },
            });
            if (duplicate) {
              await transaction.uploadSession.update({
                where: { id: session.id },
                data: {
                  status: UploadSessionStatus.COMPLETED,
                  completedAt: new Date(),
                  lastError: null,
                  albumPhotoId: duplicate.id,
                  objectCleanupPending: true,
                },
              });
              return { kind: UploadKind.ALBUM_PHOTO, photo: duplicate, duplicate: true };
            }
            const albumState = await transaction.albumState.upsert({
              where: { id: 1 },
              create: { id: 1, revision: 1n },
              update: { revision: { increment: 1 } },
              select: { revision: true },
            });
            const photo = await transaction.albumPhoto.create({
              data: {
                storageKey: session.objectKey,
                originalName: session.originalName,
                mimeType: session.mimeType,
                size: session.size,
                sha256: albumSha256,
                width: (imageDimensions ?? videoMetadata)!.width,
                height: (imageDimensions ?? videoMetadata)!.height,
                durationMs: videoMetadata?.durationMs ?? null,
                uploaderId: session.uploaderId,
                revision: albumState.revision,
              },
              select: { id: true, width: true, height: true, createdAt: true },
            });
            await transaction.albumMediaJob.upsert({
              where: { photoId_kind: { photoId: photo.id, kind: 'GENERATE_THUMBNAIL' } },
              create: { photoId: photo.id, kind: 'GENERATE_THUMBNAIL' },
              update: {
                status: 'PENDING',
                availableAt: new Date(),
                lockedAt: null,
                completedAt: null,
                lastError: null,
              },
            });
            await transaction.uploadSession.update({
              where: { id: session.id },
              data: {
                status: UploadSessionStatus.COMPLETED,
                completedAt: new Date(),
                lastError: null,
                albumPhotoId: photo.id,
              },
            });
            return { kind: UploadKind.ALBUM_PHOTO, photo, duplicate: false };
          }

          const groupId = session.groupId!;
          const existingArtifacts = await this.artifactRepository.listByGroupAscending(
            groupId,
            transaction,
          );
          const storedName = this.resolveArtifactStoredName(
            session.originalName,
            existingArtifacts.map((item) => item.storedName),
          );
          const created = await this.artifactRepository.create(
            {
              groupId,
              uploaderId: session.uploaderId,
              originalName: session.originalName,
              storedName,
              relativePath: this.artifactStorageService.serializeStorageKey(session.objectKey),
              mimeType: session.mimeType,
              size: session.size,
            },
            transaction,
          );

          await this.artifactWorkflowService.prepareArtifactUploaded(
            groupId,
            session.uploaderId,
            session.originalName,
            transaction,
          );
          await transaction.uploadSession.update({
            where: { id: session.id },
            data: {
              status: UploadSessionStatus.COMPLETED,
              completedAt: new Date(),
              lastError: null,
            },
          });

          return {
            kind: UploadKind.ARTIFACT,
            createdArtifact: created,
          };
        });
      }
    } catch (error) {
      if (error instanceof UploadSessionAlreadyFinalizedError) {
        this.logger.log(
          'complete_duplicate_returned_existing_result',
          JSON.stringify({ sessionId: session.id, objectKey: session.objectKey }),
        );
        const finalizedSession = await this.getSessionOrThrow(session.id, session.uploaderId);
        return this.getFinalizedUploadResult(finalizedSession);
      }

      // Preserve the assembled object. A later recovery pass can retry database
      // finalization without forcing the user to upload the file again.
      const isPermanentFailure = error instanceof BadRequestException;
      try {
        await this.prismaService.uploadSession.updateMany({
          where: {
            id: session.id,
            status: {
              in: [
                UploadSessionStatus.ASSEMBLED,
                UploadSessionStatus.FINALIZING,
                UploadSessionStatus.FAILED,
              ],
            },
          },
          data: {
            status: UploadSessionStatus.FAILED,
            finalizationAttempts: isPermanentFailure ? 10 : { increment: 1 },
            lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown',
          },
        });
      } catch (statusError) {
        this.logger.error(
          'upload_finalization_status_update_failed',
          JSON.stringify({
            sessionId: session.id,
            objectKey: session.objectKey,
            error: statusError instanceof Error ? statusError.message : 'Unknown',
          }),
        );
      }
      await this.notifyTargetFinalizationFailure(
        targetHandler,
        session,
        error,
        isPermanentFailure || session.finalizationAttempts + 1 >= 10,
        isPermanentFailure,
      );
      throw error;
    }

    if (txResult.kind === 'REGISTERED_TARGET') {
      await targetHandler!.afterCommit?.(session, txResult.finalized);
      return txResult.finalized;
    }

    // ── thumbnail generation (fire-and-forget, best-effort) ──
    if (txResult.kind === UploadKind.CHAT_ATTACHMENT) {
      const file = txResult.createdFileObject;
      const shouldGenerateThumbnail = this.filesService.shouldGenerateThumbnail(session.mimeType);

      if (shouldGenerateThumbnail) {
        // Run thumbnail generation asynchronously so it doesn't block the upload
        // response. When the NAS is under memory pressure (swap), sharp can stall
        // for tens of seconds and cause the client to time out.
        this.generateThumbnail(session.objectKey, file.id, file.groupId).catch((error) => {
          this.logger.warn(
            'thumbnail_generation_failed_in_complete_upload',
            JSON.stringify({
              fileId: file.id,
              error: error instanceof Error ? error.message : 'Unknown',
            }),
          );
        });
      }

      return {
        kind: UploadKind.CHAT_ATTACHMENT,
        file: {
          id: file.id,
          groupId: file.groupId,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: Number(file.size),
          width: file.imageWidth ?? null,
          height: file.imageHeight ?? null,
          createdAt: file.createdAt,
          contentUrl: this.filesService.createDirectFileAccessUrl({
            id: file.id,
            groupId: file.groupId,
          }),
          metadataUrl: this.filesService.createDirectFileMetadataUrl({
            id: file.id,
            groupId: file.groupId,
          }),
          thumbnailUrl: this.filesService.shouldExposeInlineThumbnail(
            file.mimeType,
            file.thumbnailStorageKey,
          )
            ? this.filesService.createThumbnailAccessUrl({ id: file.id, groupId: file.groupId })
            : null,
          uploaderId: file.uploaderId,
          kindLabel: file.mimeType.startsWith('image/') ? 'image' : 'file',
        },
      } satisfies FinalizedUploadResult;
    }

    if (txResult.kind === UploadKind.SUBSCRIPTION_ATTACHMENT) {
      const attachment = txResult.attachment;
      return {
        kind: UploadKind.SUBSCRIPTION_ATTACHMENT,
        attachment: {
          id: attachment.id,
          postId: attachment.postId,
          uploaderId: attachment.uploaderId,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: Number(attachment.size),
          sha256: attachment.sha256!,
          downloadCount: Number(attachment.downloadCount),
          usage: attachment.usage,
          createdAt: attachment.createdAt,
        },
      } satisfies FinalizedUploadResult;
    }

    if (txResult.kind === UploadKind.ALBUM_PHOTO) {
      const photo = txResult.photo;
      if (txResult.duplicate) {
        const removed = await this.filesService.deleteS3Object(session.objectKey);
        if (removed) {
          await this.prismaService.uploadSession.update({
            where: { id: session.id },
            data: { objectCleanupPending: false },
          });
        } else {
          this.logger.warn(
            'album_duplicate_object_cleanup_deferred',
            JSON.stringify({ sessionId: session.id, objectKey: session.objectKey }),
          );
        }
      }
      return {
        kind: UploadKind.ALBUM_PHOTO,
        photo: {
          ...this.albumPhotoResponse(photo),
          thumbnailUrl:
            session.mimeType === 'video/mp4'
              ? null
              : this.albumStorageService!.thumbnailUrl(photo.id),
          duplicate: txResult.duplicate,
        },
      };
    }

    // ARTIFACT result — already fully created in transaction, just serialize
    const artifact = txResult.createdArtifact;
    return {
      kind: UploadKind.ARTIFACT,
      artifact: {
        id: artifact.id,
        groupId: artifact.groupId,
        uploaderId: artifact.uploaderId,
        originalName: artifact.originalName,
        storedName: artifact.storedName,
        relativePath: artifact.relativePath,
        mimeType: artifact.mimeType,
        size: Number(artifact.size),
        createdAt: artifact.createdAt,
        contentUrl: this.artifactStorageService.createArtifactContentUrl({
          id: artifact.id,
          groupId: artifact.groupId,
        }),
        metadataUrl: this.artifactStorageService.createArtifactMetadataUrl({
          id: artifact.id,
          groupId: artifact.groupId,
        }),
      },
    } satisfies FinalizedUploadResult;
  }

  async abortUpload(userId: string, sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId, userId);
    if (session.status === UploadSessionStatus.ABORTED) {
      return {
        uploadSessionId: session.id,
        aborted: true,
      };
    }
    if (session.status !== UploadSessionStatus.INITIATED) {
      throw new BadRequestException('已组装或完成的上传不能中止。');
    }

    await this.filesService.abortMultipartUpload(session.objectKey, session.multipartUploadId);
    await this.prismaService.$transaction(async (transaction) => {
      const updated = await transaction.uploadSession.updateMany({
        where: {
          id: session.id,
          status: UploadSessionStatus.INITIATED,
        },
        data: {
          status: UploadSessionStatus.ABORTED,
          abortedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new BadRequestException('上传会话状态已变化，请重试。');
      }
      if (session.subscriptionAttachmentId) {
        await transaction.subscriptionAttachment.delete({
          where: { id: session.subscriptionAttachmentId },
        });
      }
    });

    return {
      uploadSessionId: session.id,
      aborted: true,
    };
  }

  async recoverUploadSession(sessionId: string): Promise<FinalizedUploadResult> {
    const session = await this.prismaService.uploadSession.findUnique({
      where: { id: sessionId },
      select: uploadSessionSelect,
    });
    if (!session) {
      throw new NotFoundException('上传会话不存在。');
    }
    if (
      session.status !== UploadSessionStatus.INITIATED &&
      session.status !== UploadSessionStatus.ASSEMBLED &&
      session.status !== UploadSessionStatus.FAILED
    ) {
      throw new BadRequestException('上传会话当前不需要恢复。');
    }
    try {
      return await this.completeUpload(
        session.uploaderId,
        session.id,
        this.parseCompletionParts(session.completionParts),
      );
    } catch (error) {
      // completeUpload owns retry accounting after assembly. Only count failures that
      // happen while the multipart upload is still INITIATED.
      await this.prismaService.uploadSession.updateMany({
        where: {
          id: session.id,
          status: UploadSessionStatus.INITIATED,
        },
        data: {
          finalizationAttempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown',
        },
      });
      throw error;
    }
  }

  private async notifyTargetFinalizationFailure(
    targetHandler: UploadTargetHandler | undefined,
    session: UploadSessionRecord,
    error: unknown,
    terminal: boolean,
    permanent: boolean,
  ): Promise<void> {
    if (!targetHandler?.onFinalizationFailure) return;
    try {
      await targetHandler.onFinalizationFailure(session, error, { terminal, permanent });
    } catch (notificationError) {
      this.logger.error(
        'upload_target_failure_notification_failed',
        JSON.stringify({
          sessionId: session.id,
          error: notificationError instanceof Error ? notificationError.message : 'Unknown',
        }),
      );
    }
  }

  async getUploadedParts(userId: string, sessionId: string) {
    const session = await this.getActiveSessionOrThrow(sessionId, userId);
    const parts = await this.filesService.listMultipartParts(
      session.objectKey,
      session.multipartUploadId,
    );

    return {
      uploadSessionId: session.id,
      partSizeBytes: UPLOAD_PART_SIZE_BYTES,
      parts: parts.map((p) => ({
        partNumber: p.PartNumber,
        etag: p.ETag,
        size: p.Size,
      })),
    };
  }

  private validatePartsCompleteness(
    parts: Array<{ partNumber: number; etag: string }>,
    expectedPartCount: number,
  ): void {
    const partNumbers = parts.map((p) => p.partNumber).sort((a, b) => a - b);

    // Verify part numbers are sequential starting from 1
    for (let i = 0; i < partNumbers.length; i++) {
      if (partNumbers[i] !== i + 1) {
        throw new BadRequestException(
          `分片不连续：期望第${i + 1}个分片，收到第${partNumbers[i]}个。`,
        );
      }
    }

    // Verify we have all parts to cover the file
    if (partNumbers.length !== expectedPartCount) {
      throw new BadRequestException(
        `分片数量不足：期望${expectedPartCount}个，收到${partNumbers.length}个。`,
      );
    }

    // Verify every part has a non-empty ETag
    for (const part of parts) {
      if (!part.etag || part.etag.trim().length === 0) {
        throw new BadRequestException(`分片 ${part.partNumber} 缺少 ETag。`);
      }
    }
  }

  /**
   * Lightweight MIME validation for assembled S3 objects.
   * Reads only the first 512 bytes via a ranged S3 get, checks magic bytes,
   * and rejects dangerous mismatches (e.g. HTML/JS disguised as images).
   * Best-effort — when magic bytes can't determine the type, the object is allowed.
   */
  private async validateObjectMime(objectKey: string, claimedMime: string): Promise<void> {
    try {
      const { stream } = await this.filesService.getStreamFromS3(objectKey, 'bytes=0-511');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const head = Buffer.concat(chunks);

      const detected = this.detectMimeFromHead(head);
      if (!detected) return;
      if (claimedMime === detected) return;
      if (claimedMime === 'video/mp4') {
        throw new BadRequestException('文件内容不是有效的 MP4 视频。');
      }
      // Same broad category is acceptable (e.g. image/png claimed, image/webp detected)
      if (claimedMime.startsWith('image/') && detected.startsWith('image/')) return;

      const dangerousPairs: Array<{ claimed: string; actual: string }> = [
        { claimed: 'image/', actual: 'text/html' },
        { claimed: 'image/', actual: 'text/javascript' },
        { claimed: 'image/', actual: 'application/javascript' },
      ];

      for (const pair of dangerousPairs) {
        if (claimedMime.startsWith(pair.claimed) && detected === pair.actual) {
          this.logger.warn(
            'multipart_mime_mismatch_rejected',
            JSON.stringify({ objectKey, claimed: claimedMime, detected }),
          );
          throw new BadRequestException('文件内容与类型不匹配，请检查文件。');
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // Non-critical failure (e.g. S3 error reading header) — allow the upload
      this.logger.warn(
        'mime_validation_skipped',
        JSON.stringify({ objectKey, error: error instanceof Error ? error.message : 'Unknown' }),
      );
    }
  }

  private detectMimeFromHead(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38)
      return 'image/gif';
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46)
      return 'image/webp';
    if (
      buffer.length >= 12 &&
      buffer[4] === 0x66 &&
      buffer[5] === 0x74 &&
      buffer[6] === 0x79 &&
      buffer[7] === 0x70
    )
      return 'video/mp4';
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)
      return 'application/pdf';
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
      return 'application/zip';

    const head = buffer.slice(0, 256).toString('utf8').toLowerCase();
    if (head.includes('<!doctype html') || head.includes('<html')) return 'text/html';
    if (head.includes('<script') || head.includes('function(') || head.includes('var '))
      return 'text/javascript';

    return null;
  }

  private resolveAlbumImageMimeType(fileName: string, claimedMime: string | undefined): string {
    const normalizedClaim = claimedMime?.trim().toLowerCase();
    const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (normalizedClaim) {
      if (normalizedClaim === 'video/mp4' && extension !== '.mp4') {
        throw new BadRequestException('MP4 视频文件扩展名必须为 .mp4。');
      }
      return normalizedClaim;
    }
    return (
      (extension && ALBUM_IMAGE_MIME_BY_EXTENSION.get(extension)) ?? 'application/octet-stream'
    );
  }

  private async assertUploadAllowed(kind: UploadKind, sizeBytes: bigint): Promise<void> {
    if (kind === UploadKind.CHAT_ATTACHMENT) {
      const limitBytes = BigInt(await this.fileUploadConfigService.getChatAttachmentMaxBytes());
      if (sizeBytes > limitBytes) {
        throw new BadRequestException(`上传文件过大，限制为 ${limitBytes / 1024n / 1024n}MB。`);
      }
      return;
    }

    if (sizeBytes > this.artifactMaxUploadBytes) {
      throw new BadRequestException('上传产出文件过大，当前限制为 10GB。');
    }
  }

  private async getActiveSessionOrThrow(
    sessionId: string,
    userId: string,
  ): Promise<UploadSessionRecord> {
    const session = await this.getSessionOrThrow(sessionId, userId);
    if (session.status !== UploadSessionStatus.INITIATED) {
      throw new BadRequestException('上传会话已结束。');
    }

    return session;
  }

  private async getCompletableSessionOrThrow(
    sessionId: string,
    userId: string,
  ): Promise<UploadSessionRecord> {
    const session = await this.getSessionOrThrow(sessionId, userId);
    if (
      session.status !== UploadSessionStatus.INITIATED &&
      session.status !== UploadSessionStatus.ASSEMBLED &&
      session.status !== UploadSessionStatus.FAILED &&
      session.status !== UploadSessionStatus.COMPLETED
    ) {
      throw new BadRequestException('上传会话已结束。');
    }
    return session;
  }

  private async getFinalizedUploadResult(
    session: UploadSessionRecord,
  ): Promise<FinalizedUploadResult> {
    const targetHandler = this.uploadTargets?.get(session.kind);
    if (targetHandler) return targetHandler.getFinalizedResult(session);

    if (session.kind === UploadKind.CHAT_ATTACHMENT) {
      const file = await this.prismaService.fileObject.findFirst({
        where: { storageKey: session.objectKey },
        select: {
          id: true,
          groupId: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
          uploaderId: true,
          thumbnailStorageKey: true,
          imageWidth: true,
          imageHeight: true,
        },
      });
      if (!file) {
        throw new ServiceUnavailableException('上传已完成，但文件记录暂时不可用。');
      }
      return {
        kind: UploadKind.CHAT_ATTACHMENT,
        file: {
          id: file.id,
          groupId: file.groupId,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: Number(file.size),
          width: file.imageWidth,
          height: file.imageHeight,
          createdAt: file.createdAt,
          contentUrl: this.filesService.createDirectFileAccessUrl(file),
          metadataUrl: this.filesService.createDirectFileMetadataUrl(file),
          thumbnailUrl: this.filesService.shouldExposeInlineThumbnail(
            file.mimeType,
            file.thumbnailStorageKey,
          )
            ? this.filesService.createThumbnailAccessUrl(file)
            : null,
          uploaderId: file.uploaderId,
          kindLabel: file.mimeType.startsWith('image/') ? 'image' : 'file',
        },
      };
    }

    if (session.kind === UploadKind.SUBSCRIPTION_ATTACHMENT) {
      if (!session.subscriptionAttachmentId) {
        throw new ServiceUnavailableException('上传已完成，但文章附件记录缺失。');
      }
      const attachment = await this.prismaService.subscriptionAttachment.findUnique({
        where: { id: session.subscriptionAttachmentId },
        select: {
          id: true,
          postId: true,
          uploaderId: true,
          originalName: true,
          mimeType: true,
          size: true,
          sha256: true,
          downloadCount: true,
          usage: true,
          createdAt: true,
        },
      });
      if (!attachment?.sha256) {
        throw new ServiceUnavailableException('上传已完成，但文章附件记录暂时不可用。');
      }
      return {
        kind: UploadKind.SUBSCRIPTION_ATTACHMENT,
        attachment: {
          ...attachment,
          size: Number(attachment.size),
          sha256: attachment.sha256,
          downloadCount: Number(attachment.downloadCount),
        },
      };
    }

    if (session.kind === UploadKind.ALBUM_PHOTO) {
      const photo = await this.prismaService.albumPhoto.findFirst({
        where: session.albumPhotoId
          ? { id: session.albumPhotoId, deletedAt: null }
          : { storageKey: session.objectKey, deletedAt: null },
        select: { id: true, width: true, height: true, createdAt: true },
      });
      if (!photo) throw new ServiceUnavailableException('上传已完成，但相册记录暂时不可用。');
      return {
        kind: UploadKind.ALBUM_PHOTO,
        photo: {
          ...this.albumPhotoResponse(photo),
          thumbnailUrl:
            session.mimeType === 'video/mp4'
              ? null
              : this.albumStorageService!.thumbnailUrl(photo.id),
          duplicate:
            session.objectKey !==
            (
              await this.prismaService.albumPhoto.findUnique({
                where: { id: photo.id },
                select: { storageKey: true },
              })
            )?.storageKey,
        },
      };
    }

    const artifact = await this.prismaService.groupArtifact.findFirst({
      where: {
        relativePath: this.artifactStorageService.serializeStorageKey(session.objectKey),
      },
      select: {
        id: true,
        groupId: true,
        uploaderId: true,
        originalName: true,
        storedName: true,
        relativePath: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });
    if (!artifact) {
      throw new ServiceUnavailableException('上传已完成，但产出记录暂时不可用。');
    }
    return {
      kind: UploadKind.ARTIFACT,
      artifact: {
        ...artifact,
        size: Number(artifact.size),
        contentUrl: this.artifactStorageService.createArtifactContentUrl(artifact),
        metadataUrl: this.artifactStorageService.createArtifactMetadataUrl(artifact),
      },
    };
  }

  private async getSessionOrThrow(sessionId: string, userId: string): Promise<UploadSessionRecord> {
    const session = await this.prismaService.uploadSession.findUnique({
      where: { id: sessionId },
      select: uploadSessionSelect,
    });

    if (!session) {
      throw new NotFoundException('上传会话不存在。');
    }
    if (session.uploaderId !== userId) {
      throw new ForbiddenException('上传会话无权访问。');
    }
    return session;
  }

  private albumPhotoResponse(photo: {
    id: string;
    width: number;
    height: number;
    createdAt: Date;
  }) {
    return {
      id: photo.id,
      width: photo.width,
      height: photo.height,
      createdAt: photo.createdAt,
      contentUrl: this.albumStorageService!.contentUrl(photo.id),
    };
  }

  private parseCompletionParts(value: Prisma.JsonValue | null) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException('上传会话缺少可恢复的分片信息。');
    }
    return value.map((part) => {
      if (
        typeof part !== 'object' ||
        part === null ||
        Array.isArray(part) ||
        typeof part.partNumber !== 'number' ||
        typeof part.etag !== 'string'
      ) {
        throw new BadRequestException('上传会话的分片信息无效。');
      }
      return {
        partNumber: part.partNumber,
        etag: part.etag,
      };
    });
  }

  private normalizeOriginalName(originalName: string) {
    return this.filesService.normalizeDirectUploadOriginalName(originalName);
  }

  private resolveArtifactStoredName(originalName: string, existingStoredNames: string[] = []) {
    const baseName = originalName.trim() || 'artifact.bin';
    if (!existingStoredNames.includes(baseName)) {
      return baseName;
    }

    let suffix = 2;
    while (existingStoredNames.includes(`${suffix}-${baseName}`)) {
      suffix += 1;
    }

    return `${suffix}-${baseName}`;
  }

  private async generateThumbnail(
    objectKey: string,
    fileId: string,
    fileGroupId: string,
  ): Promise<void> {
    const { stream } = await this.filesService.getStreamFromS3(objectKey);

    const thumbBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream
        .pipe(
          createImageProcessor()
            .resize({ width: 400, withoutEnlargement: true })
            .jpeg({ quality: 85 }),
        )
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });

    const idx = objectKey.indexOf('/');
    const groupId = objectKey.slice(0, idx);
    const objKey = objectKey.slice(idx + 1);
    const thumbKey = `${groupId}/thumb/${objKey}.jpg`;

    await this.filesService.uploadBufferToS3(thumbKey, thumbBuffer, 'image/jpeg');

    await this.prismaService.fileObject.update({
      where: { id: fileId },
      data: { thumbnailStorageKey: thumbKey, thumbnailSize: thumbBuffer.length },
    });

    this.logger.log(
      'thumbnail_generated',
      JSON.stringify({ fileId, thumbKey, size: thumbBuffer.length, fileGroupId }),
    );
  }

  private async getWritableGroupOrThrow(groupId: string, userId: string, kind: UploadKind) {
    const group = await this.prismaService.group.findFirst({
      where: {
        id: groupId,
        members: {
          some: {
            userId,
          },
        },
      },
      select: {
        id: true,
        archivedAt: true,
        artifactsConfirmedAt: true,
      },
    });

    if (!group) {
      throw new ForbiddenException('Group access denied.');
    }
    if (group.archivedAt) {
      throw new BadRequestException('Archived group is read-only.');
    }
    if (kind === UploadKind.ARTIFACT && group.artifactsConfirmedAt) {
      throw new BadRequestException('当前产出已确认，请先解除确认再继续编辑。');
    }

    return group;
  }
}
