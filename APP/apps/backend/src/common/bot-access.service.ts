import { ForbiddenException, Injectable } from '@nestjs/common';
import { canTriggerBotReply, isAgentBot } from './bot-identity';
import { PrismaService } from '../prisma/prisma.service';
import { MessageGroup } from '../messages/message-group.type';

@Injectable()
export class BotAccessService {
  constructor(private readonly prismaService: PrismaService) {}

  async ensureTextMessageAccessAllowed(input: {
    group: MessageGroup;
    actorUserId: string;
    text?: string;
  }): Promise<void> {
    if (!input.group.isDM || !input.text) {
      return;
    }

    const botMember = input.group.members.find(
      (member) => member.userId !== input.actorUserId && isAgentBot(member.user),
    );

    if (botMember) {
      await this.ensureBotAccessAllowed(botMember.userId, input.actorUserId);
    }
  }

  async ensureBotAccessAllowed(botUserId: string, actorUserId: string): Promise<void> {
    const bot = await this.prismaService.user.findUnique({
      where: { id: botUserId },
      select: { role: true, isBot: true, botConfig: true },
    });
    const botConfig = bot?.botConfig as Record<string, unknown> | null | undefined;
    const allowed = botConfig?.allowedUserIds as string[] | undefined;

    if (!canTriggerBotReply(bot, botConfig) || (allowed && allowed.length > 0 && !allowed.includes(actorUserId))) {
      throw new ForbiddenException('This bot is not available for this user.');
    }
  }

  async listReplyTargets(input: {
    group: MessageGroup;
    actorUserId: string;
    mentionedUserIds: string[];
  }): Promise<string[]> {
    const sender = input.group.members.find((member) => member.userId === input.actorUserId);
    if (isAgentBot(sender?.user)) {
      return [];
    }

    const botMembers = input.group.isDM
      ? input.group.members.filter((member) => member.userId !== input.actorUserId && isAgentBot(member.user))
      : input.group.members.filter(
          (member) => input.mentionedUserIds.includes(member.userId) && isAgentBot(member.user),
        );

    const botUserIds: string[] = [];
    for (const botMember of botMembers) {
      await this.ensureBotAccessAllowed(botMember.userId, input.actorUserId);
      botUserIds.push(botMember.userId);
    }

    return botUserIds;
  }
}
