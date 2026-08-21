import { Injectable } from '@nestjs/common';
import { AvatarsService } from '../avatars/avatars.service';
import {
  READ_RECEIPT_WINDOW_MS,
  type MessageReceiptMember,
  type SerializedMessage,
  type SerializedReadReceiptMember,
} from './message-record.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessageReadReceiptService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly avatarsService: AvatarsService,
  ) {}

  async touchGroupAndReadReceipt(
    groupId: string,
    userId: string,
    createdAt: Date,
    eventSequence: bigint,
  ): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.group.update({
        where: { id: groupId },
        data: {
          updatedAt: createdAt,
        },
      }),
      this.prismaService.groupMember.updateMany({
        where: { groupId, userId },
        data: { lastReadEventSequence: eventSequence },
      }),
    ]);
  }

  async listMessageReceiptMembers(groupId: string): Promise<MessageReceiptMember[]> {
    const members = await this.prismaService.groupMember.findMany({
      where: { groupId },
      orderBy: [{ joinedAt: 'asc' }],
      select: {
        userId: true,
        lastReadEventSequence: true,
        user: {
          select: {
            email: true,
            displayName: true,
            avatarStorageKey: true,
            isBot: true,
          },
        },
      },
    });

    return members.map((member) => ({
      userId: member.userId,
      email: member.user.email,
      displayName: member.user.displayName,
      avatarStorageKey: member.user.avatarStorageKey,
      lastReadEventSequence: member.lastReadEventSequence,
      isBot: member.user.isBot,
    }));
  }

  serializeReceiptMember(member: MessageReceiptMember): SerializedReadReceiptMember {
    return {
      userId: member.userId,
      email: member.email,
      displayName: member.displayName,
      avatarUrl: this.avatarsService.buildUserAvatarUrl(member.userId, member.avatarStorageKey),
    };
  }

  buildReadReceipt(
    message: Pick<SerializedMessage, 'senderId' | 'eventSequence' | 'createdAt'>,
    receiptMembers: MessageReceiptMember[],
  ) {
    if (Date.now() - message.createdAt.getTime() > READ_RECEIPT_WINDOW_MS) {
      return null;
    }

    const recipients = receiptMembers.filter((member) => member.userId !== message.senderId && !member.isBot);
    const readBy: SerializedReadReceiptMember[] = [];
    const unreadBy: SerializedReadReceiptMember[] = [];

    for (const member of recipients) {
      const target = member.lastReadEventSequence !== null && member.lastReadEventSequence >= message.eventSequence
        ? readBy
        : unreadBy;
      target.push(this.serializeReceiptMember(member));
    }

    return {
      totalRecipients: recipients.length,
      readCount: readBy.length,
      unreadCount: unreadBy.length,
      readBy,
      unreadBy,
    };
  }
}
