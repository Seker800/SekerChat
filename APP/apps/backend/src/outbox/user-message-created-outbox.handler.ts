import { Injectable } from '@nestjs/common';
import type { OutboxEvent, Prisma } from '@prisma/client';
import { MessageApplicationService } from '../messages/message-application.service';
import { messageSelect } from '../messages/message-record.types';
import { PrismaService } from '../prisma/prisma.service';
import { OUTBOX_EVENT_TYPES } from './outbox.types';

type UserMessageCreatedPayload = { messageId: string };

@Injectable()
export class UserMessageCreatedOutboxHandler {
  readonly eventType = OUTBOX_EVENT_TYPES.userMessageCreated;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly applicationService: MessageApplicationService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const { messageId } = this.parsePayload(event.payload);
    const message = await this.prismaService.message.findUnique({
      where: { id: messageId },
      select: messageSelect,
    });
    if (!message) {
      return;
    }

    const group = await this.prismaService.group.findUnique({
      where: { id: message.groupId },
      select: {
        id: true,
        isDM: true,
        members: {
          select: {
            userId: true,
            user: {
              select: {
                email: true,
                displayName: true,
                role: true,
                isBot: true,
              },
            },
          },
        },
      },
    });
    if (!group) {
      return;
    }

    await this.applicationService.deliverUserMessageCreated({
      eventId: event.id,
      group,
      message,
    });
  }

  private parsePayload(payload: Prisma.JsonValue): UserMessageCreatedPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof payload.messageId !== 'string'
    ) {
      throw new Error('Invalid message.user-created.v1 outbox payload.');
    }
    return { messageId: payload.messageId };
  }
}
