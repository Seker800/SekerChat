import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionAttachmentUsage,
  SubscriptionAttachmentStatus,
  SubscriptionPostStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RangeNotSatisfiableException } from '../common/range-parser';
import { OutboxService } from '../outbox/outbox.service';
import { OUTBOX_EVENT_TYPES } from '../outbox/outbox.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../system-config/permission.service';
import { CreateSubscriptionPostDto, UpdateSubscriptionPostDto } from './dto/upsert-subscription-post.dto';
import { buildSubscriptionBodyPreview, isSubscriptionManagerRole } from './subscription-policy';
import { SubscriptionRealtimePublisher } from './subscription-realtime-publisher.service';
import { SubscriptionStorageService } from './subscription-storage.service';

const subscriptionPostInclude = {
  author: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
  attachments: {
    where: { status: SubscriptionAttachmentStatus.READY },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SubscriptionPostInclude;

type SubscriptionPostRecord = Prisma.SubscriptionPostGetPayload<{
  include: typeof subscriptionPostInclude;
}>;

type SubscriptionPostWithRecipientState = SubscriptionPostRecord & {
  recipients?: Array<{ confirmedAt: Date | null }>;
};

type ConfirmationProgress = {
  confirmedCount: number;
  recipientCount: number;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly outboxService: OutboxService,
    private readonly realtimePublisher: SubscriptionRealtimePublisher,
    private readonly storageService?: SubscriptionStorageService,
  ) {}

  async canManage(actor: AuthenticatedUser): Promise<boolean> {
    if (!isSubscriptionManagerRole(actor.role)) return false;
    return this.permissionService.hasPermission(actor.role, 'manage_subscription_posts');
  }

  async getSummary(userId: string) {
    const pendingConfirmationCount = await this.prisma.subscriptionPostRecipient.count({
      where: {
        userId,
        confirmedAt: null,
        post: { status: SubscriptionPostStatus.PUBLISHED },
      },
    });
    return {
      pendingConfirmationCount,
      unreadCount: pendingConfirmationCount,
    };
  }

  async listPublished(actor: AuthenticatedUser) {
    const canViewProgress = await this.canManage(actor);
    const posts = await this.prisma.subscriptionPost.findMany({
      where: {
        status: SubscriptionPostStatus.PUBLISHED,
      },
      include: {
        ...subscriptionPostInclude,
        recipients: {
          where: { userId: actor.sub },
          select: { confirmedAt: true },
        },
      },
      orderBy: [{ pinnedAt: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    const pendingConfirmationCount = await this.prisma.subscriptionPostRecipient.count({
      where: {
        userId: actor.sub,
        confirmedAt: null,
        post: { status: SubscriptionPostStatus.PUBLISHED },
      },
    });
    const progress = await this.getConfirmationProgress(
      posts.map((post) => post.id),
      canViewProgress,
    );
    const items = posts.map((post) =>
      this.serializePostSummary(post, progress.get(post.id) ?? null),
    );
    items.sort((left, right) =>
      Number(left.isConfirmed || !left.isRecipient) -
      Number(right.isConfirmed || !right.isRecipient),
    );
    return {
      items,
      pendingConfirmationCount,
      unreadCount: pendingConfirmationCount,
    };
  }

  async listManageable(actor: AuthenticatedUser, status?: SubscriptionPostStatus) {
    await this.assertCanManage(actor);
    const posts = await this.prisma.subscriptionPost.findMany({
      where: status ? { status } : undefined,
      include: subscriptionPostInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    });
    const progress = await this.getConfirmationProgress(posts.map((post) => post.id), true);
    return { items: posts.map((post) => this.serializePost(post, progress.get(post.id) ?? null)) };
  }

  async getPublishedPost(actor: AuthenticatedUser, postId: string) {
    const canViewProgress = await this.canManage(actor);
    const post = await this.prisma.subscriptionPost.findFirst({
      where: { id: postId, status: SubscriptionPostStatus.PUBLISHED },
      include: {
        ...subscriptionPostInclude,
        recipients: {
          where: { userId: actor.sub },
          select: { confirmedAt: true },
        },
      },
    });
    if (!post) {
      throw new NotFoundException('文章不存在。');
    }
    const progress = await this.getConfirmationProgress([post.id], canViewProgress);
    return this.serializePost(post, progress.get(post.id) ?? null);
  }

  async createDraft(actor: AuthenticatedUser, dto: CreateSubscriptionPostDto) {
    await this.assertCanManage(actor);
    const data = this.normalizePostInput(dto, { allowEmptyTitle: true });
    const post = await this.prisma.subscriptionPost.create({
      data: {
        title: data.title!,
        body: data.body ?? '',
        tags: data.tags ?? [],
        authorId: actor.sub,
        status: SubscriptionPostStatus.DRAFT,
        auditLogs: {
          create: {
            actorId: actor.sub,
            action: 'created',
          },
        },
      },
      include: subscriptionPostInclude,
    });
    return this.serializePost(post, null);
  }

  async updatePost(actor: AuthenticatedUser, postId: string, dto: UpdateSubscriptionPostDto) {
    await this.assertCanManage(actor);
    const current = await this.getManageablePostOrThrow(postId);
    const data = this.normalizePostInput(dto, {
      allowEmptyTitle: current.status === SubscriptionPostStatus.DRAFT,
    });
    const post = await this.prisma.subscriptionPost.update({
      where: { id: postId },
      data: {
        ...data,
        auditLogs: { create: { actorId: actor.sub, action: 'updated' } },
      },
      include: subscriptionPostInclude,
    });
    await this.realtimePublisher.publishSubscriptionChanged({ postId, reason: 'updated' });
    return this.serializePost(post, null);
  }

  async publish(actor: AuthenticatedUser, postId: string) {
    await this.assertCanManage(actor);
    const now = new Date();
    const post = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.subscriptionPost.findUnique({
        where: { id: postId },
        include: {
          attachments: true,
        },
      });
      if (!current) {
        throw new NotFoundException('文章草稿不存在。');
      }
      if (current.status !== SubscriptionPostStatus.DRAFT) {
        throw new BadRequestException('只有草稿可以发布。');
      }
      if (!current.title.trim()) {
        throw new BadRequestException('发布前必须填写标题。');
      }
      if (current.attachments.some((attachment) => attachment.status !== SubscriptionAttachmentStatus.READY)) {
        throw new BadRequestException('仍有附件未上传完成，请完成后再发布。');
      }
      const recipients = await transaction.user.findMany({
        where: {
          disabledAt: null,
          isBot: false,
        },
        select: { id: true },
      });
      const updated = await transaction.subscriptionPost.update({
        where: { id: postId },
        data: {
          status: SubscriptionPostStatus.PUBLISHED,
          publishedAt: now,
          withdrawnAt: null,
        },
        include: subscriptionPostInclude,
      });
      await transaction.subscriptionAuditLog.create({
        data: { postId, actorId: actor.sub, action: 'published' },
      });
      if (recipients.length > 0) {
        await transaction.subscriptionPostRecipient.createMany({
          data: recipients.map((recipient) => ({
            postId,
            userId: recipient.id,
            assignedAt: now,
          })),
          skipDuplicates: true,
        });
      }
      await this.enqueueSubscriptionChanged(transaction, {
        postId,
        reason: 'published',
      });
      return updated;
    });
    return this.serializePost(post, null);
  }

  async withdraw(actor: AuthenticatedUser, postId: string) {
    await this.assertCanManage(actor);
    const post = await this.prisma.$transaction(async (transaction) => {
      const [current] = await transaction.$queryRaw<Array<{
        id: string;
        status: SubscriptionPostStatus;
      }>>(Prisma.sql`
        SELECT "id", "status"
        FROM "SubscriptionPost"
        WHERE "id" = ${postId}
        FOR UPDATE
      `);
      if (!current) throw new NotFoundException('文章不存在。');
      if (current.status !== SubscriptionPostStatus.PUBLISHED) {
        throw new BadRequestException('只有已发布文章可以撤回。');
      }
      return transaction.subscriptionPost.update({
        where: { id: postId },
        data: {
          status: SubscriptionPostStatus.WITHDRAWN,
          withdrawnAt: new Date(),
          pinnedAt: null,
          auditLogs: { create: { actorId: actor.sub, action: 'withdrawn' } },
        },
        include: subscriptionPostInclude,
      });
    });
    await this.realtimePublisher.publishSubscriptionChanged({ postId, reason: 'withdrawn' });
    return this.serializePost(post, null);
  }

  async setPinned(actor: AuthenticatedUser, postId: string, pinned: boolean) {
    await this.assertCanManage(actor);
    const current = await this.getManageablePostOrThrow(postId);
    if (current.status !== SubscriptionPostStatus.PUBLISHED) {
      throw new BadRequestException('只有已发布文章可以置顶。');
    }
    const post = await this.prisma.subscriptionPost.update({
      where: { id: postId },
      data: {
        pinnedAt: pinned ? new Date() : null,
        auditLogs: { create: { actorId: actor.sub, action: pinned ? 'pinned' : 'unpinned' } },
      },
      include: subscriptionPostInclude,
    });
    await this.realtimePublisher.publishSubscriptionChanged({ postId, reason: 'pinned' });
    return this.serializePost(post, null);
  }

  async deletePost(actor: AuthenticatedUser, postId: string) {
    await this.assertCanManage(actor);
    const post = await this.prisma.subscriptionPost.findUnique({
      where: { id: postId },
      include: { attachments: true },
    });
    if (!post) {
      throw new NotFoundException('文章不存在。');
    }
    await this.prisma.subscriptionPost.delete({ where: { id: postId } });
    if (this.storageService) {
      await Promise.allSettled(
        post.attachments.map((attachment) => this.storageService!.deleteObject(attachment.storageKey)),
      );
    }
    await this.realtimePublisher.publishSubscriptionChanged({ postId, reason: 'deleted' });
    return { postId, deleted: true };
  }

  async confirm(userId: string, postId: string, idempotencyKey?: string) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 200) {
      throw new BadRequestException('确认已读请求缺少有效的 Idempotency-Key。');
    }

    return this.prisma.$transaction(async (transaction) => {
      const [post] = await transaction.$queryRaw<Array<{
        id: string;
        status: SubscriptionPostStatus;
      }>>(Prisma.sql`
        SELECT "id", "status"
        FROM "SubscriptionPost"
        WHERE "id" = ${postId}
        FOR UPDATE
      `);
      if (!post) {
        throw new NotFoundException('文章不存在。');
      }
      if (post.status !== SubscriptionPostStatus.PUBLISHED) {
        throw new ConflictException('文章已撤回，无法确认已读。');
      }

      const recipient = await transaction.subscriptionPostRecipient.findUnique({
        where: { postId_userId: { postId, userId } },
        select: { confirmedAt: true },
      });
      if (!recipient) {
        throw new ForbiddenException('你不是这篇文章的确认对象。');
      }

      let confirmedAt = recipient.confirmedAt;
      if (!confirmedAt) {
        confirmedAt = new Date();
        const update = await transaction.subscriptionPostRecipient.updateMany({
          where: { postId, userId, confirmedAt: null },
          data: { confirmedAt },
        });
        if (update.count > 0) {
          await this.enqueueSubscriptionChanged(transaction, {
            postId,
            reason: 'confirmed',
            actorUserId: userId,
          });
        } else {
          confirmedAt = (
            await transaction.subscriptionPostRecipient.findUniqueOrThrow({
              where: { postId_userId: { postId, userId } },
              select: { confirmedAt: true },
            })
          ).confirmedAt;
        }
      }

      const pendingConfirmationCount = await transaction.subscriptionPostRecipient.count({
        where: {
          userId,
          confirmedAt: null,
          post: { status: SubscriptionPostStatus.PUBLISHED },
        },
      });
      return {
        isConfirmed: true,
        confirmedAt: confirmedAt!,
        pendingConfirmationCount,
      };
    });
  }

  async getConfirmations(actor: AuthenticatedUser, postId: string) {
    await this.assertCanManage(actor);
    const post = await this.prisma.subscriptionPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('文章不存在。');

    const recipients = await this.prisma.subscriptionPostRecipient.findMany({
      where: { postId },
      select: {
        userId: true,
        confirmedAt: true,
        user: { select: { displayName: true, email: true } },
      },
    });
    const confirmed = recipients
      .filter((recipient) => recipient.confirmedAt !== null)
      .sort((left, right) => left.confirmedAt!.getTime() - right.confirmedAt!.getTime())
      .map((recipient) => ({
        userId: recipient.userId,
        displayName: recipient.user.displayName,
        email: recipient.user.email,
        confirmedAt: recipient.confirmedAt!,
      }));
    const pending = recipients
      .filter((recipient) => recipient.confirmedAt === null)
      .sort((left, right) =>
        (left.user.displayName ?? left.user.email).localeCompare(
          right.user.displayName ?? right.user.email,
          'zh-CN',
        ))
      .map((recipient) => ({
        userId: recipient.userId,
        displayName: recipient.user.displayName,
        email: recipient.user.email,
      }));
    return {
      postId,
      confirmedCount: confirmed.length,
      recipientCount: recipients.length,
      confirmed,
      pending,
    };
  }

  /** @deprecated Legacy clients only; does not alter article confirmation state. */
  async markRead(userId: string, postId: string) {
    const exists = await this.prisma.subscriptionPost.findFirst({
      where: { id: postId, status: SubscriptionPostStatus.PUBLISHED },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('文章不存在。');
    }
    await this.prisma.subscriptionReadState.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: { readAt: new Date() },
    });
    return this.getSummary(userId);
  }

  /** @deprecated Legacy clients only; does not alter article confirmation state. */
  async markUnread(userId: string, postId: string) {
    const exists = await this.prisma.subscriptionPost.findFirst({
      where: { id: postId, status: SubscriptionPostStatus.PUBLISHED },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('文章不存在。');
    }
    await this.prisma.subscriptionReadState.deleteMany({
      where: { postId, userId },
    });
    return this.getSummary(userId);
  }

  /** @deprecated Legacy clients only; does not alter article confirmation state. */
  async markAllRead(userId: string) {
    const posts = await this.prisma.subscriptionPost.findMany({
      where: { status: SubscriptionPostStatus.PUBLISHED },
      select: { id: true },
    });
    await this.prisma.subscriptionReadState.createMany({
      data: posts.map((post) => ({ postId: post.id, userId, readAt: new Date() })),
      skipDuplicates: true,
    });
    return this.getSummary(userId);
  }

  async getAttachmentDownloadUrl(userId: string, attachmentId: string) {
    const attachment = await this.getReadableAttachmentOrThrow(userId, attachmentId);
    if (!this.storageService) {
      throw new ServiceUnavailableException('文章文件存储服务不可用。');
    }
    const url = await this.storageService.createDownloadUrl(
      attachment.storageKey,
      attachment.mimeType,
      attachment.originalName,
    );
    await this.incrementDownloadCount(attachment.id);
    return {
      url,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: Number(attachment.size),
    };
  }

  async getAttachmentViewUrl(actor: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.getViewableAttachmentOrThrow(actor, attachmentId);
    if (!this.storageService) {
      throw new ServiceUnavailableException('文章图片存储服务不可用。');
    }
    const url = await this.storageService.createViewUrl(
      attachment.storageKey,
      attachment.mimeType,
    );
    return {
      url,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: Number(attachment.size),
    };
  }

  async getAttachmentStream(userId: string, attachmentId: string, range?: string) {
    const attachment = await this.getReadableAttachmentOrThrow(userId, attachmentId);
    if (!this.storageService) {
      throw new ServiceUnavailableException('文章文件存储服务不可用。');
    }
    try {
      const result = await this.storageService.getStream(attachment.storageKey, range);
      await this.incrementDownloadCount(attachment.id);
      return {
        attachment,
        stream: result.stream,
        contentLength: result.contentLength ?? attachment.size,
        contentRange: result.contentRange,
      };
    } catch (error) {
      const maybeAwsError = error as Error & { name?: string; $metadata?: { httpStatusCode?: number } };
      if (maybeAwsError.name === 'NoSuchKey' || maybeAwsError.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('文章文件不存在。');
      }
      if (range && (maybeAwsError.name === 'InvalidRange' || maybeAwsError.$metadata?.httpStatusCode === 416)) {
        throw new RangeNotSatisfiableException(attachment.size);
      }
      throw new ServiceUnavailableException('对象存储不可用，请稍后重试。');
    }
  }

  private async assertCanManage(actor: AuthenticatedUser) {
    if (!isSubscriptionManagerRole(actor.role)) {
      throw new ForbiddenException('仅管理员可以管理文章。');
    }
    await this.permissionService.assertPermission(actor.role, 'manage_subscription_posts');
  }

  private async getManageablePostOrThrow(postId: string) {
    const post = await this.prisma.subscriptionPost.findUnique({
      where: { id: postId },
      include: subscriptionPostInclude,
    });
    if (!post) {
      throw new NotFoundException('文章不存在。');
    }
    return post;
  }

  private async getReadableAttachmentOrThrow(_userId: string, attachmentId: string) {
    const attachment = await this.prisma.subscriptionAttachment.findFirst({
      where: {
        id: attachmentId,
        status: SubscriptionAttachmentStatus.READY,
        post: { status: SubscriptionPostStatus.PUBLISHED },
      },
    });
    if (!attachment) {
      throw new NotFoundException('文章文件不存在。');
    }
    return attachment;
  }

  private async getViewableAttachmentOrThrow(
    actor: AuthenticatedUser,
    attachmentId: string,
  ) {
    const attachment = await this.prisma.subscriptionAttachment.findFirst({
      where: {
        id: attachmentId,
        status: SubscriptionAttachmentStatus.READY,
        mimeType: { startsWith: 'image/' },
      },
      include: {
        post: { select: { status: true } },
      },
    });
    if (!attachment) {
      throw new NotFoundException('文章图片不存在。');
    }
    if (attachment.post.status === SubscriptionPostStatus.PUBLISHED) {
      return attachment;
    }
    if (
      attachment.post.status === SubscriptionPostStatus.DRAFT
      && await this.canManage(actor)
    ) {
      return attachment;
    }
    throw new NotFoundException('文章图片不存在。');
  }

  private incrementDownloadCount(attachmentId: string) {
    return this.prisma.subscriptionAttachment.update({
      where: { id: attachmentId },
      data: { downloadCount: { increment: 1 } },
      select: { id: true },
    });
  }

  private normalizePostInput(
    dto: CreateSubscriptionPostDto | UpdateSubscriptionPostDto,
    options: { allowEmptyTitle?: boolean } = {},
  ) {
    const data: {
      title?: string;
      body?: string;
      tags?: string[];
    } = {};
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title && !options.allowEmptyTitle) {
        throw new BadRequestException('标题不能为空。');
      }
      data.title = title;
    }
    if (dto.body !== undefined) data.body = dto.body.trim();
    if (dto.tags !== undefined) {
      data.tags = [...new Set(dto.tags.map((tag) => tag.trim()).filter(Boolean))];
    }
    return data;
  }

  private async getConfirmationProgress(
    postIds: string[],
    canView: boolean,
  ): Promise<Map<string, ConfirmationProgress>> {
    if (!canView || postIds.length === 0) return new Map();
    const [recipientCounts, confirmedCounts] = await Promise.all([
      this.prisma.subscriptionPostRecipient.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds } },
        _count: { _all: true },
      }),
      this.prisma.subscriptionPostRecipient.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds }, confirmedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const confirmedByPostId = new Map(
      confirmedCounts.map((row) => [row.postId, row._count._all]),
    );
    return new Map(
      recipientCounts.map((row) => [
        row.postId,
        {
          confirmedCount: confirmedByPostId.get(row.postId) ?? 0,
          recipientCount: row._count._all,
        },
      ]),
    );
  }

  private enqueueSubscriptionChanged(
    transaction: Prisma.TransactionClient,
    payload: {
      postId: string;
      reason: 'published' | 'confirmed';
      actorUserId?: string;
    },
  ) {
    return this.outboxService.enqueue(transaction, {
      eventType: OUTBOX_EVENT_TYPES.subscriptionChanged,
      aggregateType: 'SubscriptionPost',
      aggregateId: payload.postId,
      payload,
    });
  }

  private serializePostSummary(
    post: SubscriptionPostWithRecipientState,
    confirmationProgress: ConfirmationProgress | null,
  ) {
    const recipient = post.recipients?.[0];
    const isRecipient = Boolean(recipient);
    const confirmedAt = recipient?.confirmedAt ?? null;
    const isConfirmed = confirmedAt !== null;
    return {
      id: post.id,
      status: post.status,
      title: post.title,
      bodyPreview: buildSubscriptionBodyPreview(post.body),
      tags: post.tags,
      isPinned: Boolean(post.pinnedAt),
      isConfirmed,
      isRecipient,
      confirmedAt,
      confirmationProgress,
      isRead: isConfirmed,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      author: post.author,
      attachmentCount: post.attachments.filter(
        (attachment) => attachment.usage === SubscriptionAttachmentUsage.DOWNLOADABLE_FILE,
      ).length,
      hasAttachments: post.attachments.some(
        (attachment) => attachment.usage === SubscriptionAttachmentUsage.DOWNLOADABLE_FILE,
      ),
    };
  }

  private serializePost(
    post: SubscriptionPostWithRecipientState,
    confirmationProgress: ConfirmationProgress | null,
  ) {
    const recipient = post.recipients?.[0];
    const isRecipient = Boolean(recipient);
    const confirmedAt = recipient?.confirmedAt ?? null;
    const isConfirmed = confirmedAt !== null;
    return {
      id: post.id,
      status: post.status,
      title: post.title,
      body: post.body,
      tags: post.tags,
      isPinned: Boolean(post.pinnedAt),
      isConfirmed,
      isRecipient,
      confirmedAt,
      confirmationProgress,
      isRead: isConfirmed,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      author: post.author,
      attachments: post.attachments.map((attachment) => ({
        id: attachment.id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: Number(attachment.size),
        sha256: attachment.sha256,
        downloadCount: Number(attachment.downloadCount),
        usage: attachment.usage,
      })),
    };
  }
}
