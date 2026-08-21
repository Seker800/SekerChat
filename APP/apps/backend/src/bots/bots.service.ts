import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { canTriggerBotReply, isAgentBot } from '../common/bot-identity';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import {
  CreateBotDto,
  BOT_CONFIG_DEFAULTS,
  resolveBotConfig,
  type BotConfig,
} from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { URL } from 'node:url';
import { BotReplyDeliveryRepository } from './bot-reply-delivery.repository';

const MAX_CONTEXT_MESSAGES = 30;
const DEFAULT_ALLOWED_GATEWAY_URLS = [BOT_CONFIG_DEFAULTS.gatewayUrl];

interface OpenClawMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly messagesService: MessagesService,
    private readonly replyDeliveries: BotReplyDeliveryRepository,
  ) {}

  async listBots() {
    const users = await this.prismaService.user.findMany({
      where: {
        disabledAt: null,
        role: UserRole.CLI_BOT,
        isBot: true,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
        isBot: true,
        role: true,
        botConfig: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => ({
      ...user,
      kind: isAgentBot(user) ? 'AGENT_BOT' : 'UNKNOWN',
    }));
  }

  async listPublicChatBots() {
    const users = await this.prismaService.user.findMany({
      where: {
        role: UserRole.CLI_BOT,
        isBot: true,
        disabledAt: null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
        isBot: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarStorageKey: user.avatarStorageKey,
      isBot: user.isBot,
      role: user.role,
      createdAt: user.createdAt,
      kind: isAgentBot(user) ? 'AGENT_BOT' : 'UNKNOWN',
    }));
  }

  async createBot(dto: CreateBotDto) {
    if (dto.botConfig?.gatewayUrl) {
      this.assertAllowedGatewayUrl(dto.botConfig.gatewayUrl);
    }

    const existing = await this.prismaService.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException('A user with this email already exists.');
    }

    const user = await this.prismaService.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        role: UserRole.CLI_BOT,
        isBot: true,
        botConfig: (dto.botConfig ?? {}) as any,
        emailVerifiedAt: new Date(),
      },
    });

    this.logger.log('bot_created', JSON.stringify({ botId: user.id, email: user.email }));

    const created = await this.prismaService.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
        role: true,
        isBot: true,
        botConfig: true,
        createdAt: true,
      },
    });

    return {
      ...created,
      kind: isAgentBot(created) ? 'AGENT_BOT' : 'UNKNOWN',
    };
  }

  async updateBot(botId: string, dto: UpdateBotDto) {
    const bot = await this.prismaService.user.findFirst({
      where: { id: botId, role: UserRole.CLI_BOT, isBot: true },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found.');
    }

    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.botConfig !== undefined) {
      if (dto.botConfig?.gatewayUrl) {
        this.assertAllowedGatewayUrl(dto.botConfig.gatewayUrl);
      }
      data.botConfig = dto.botConfig as any;
    }
    data.role = UserRole.CLI_BOT;
    data.isBot = true;

    await this.prismaService.user.update({
      where: { id: botId },
      data,
    });

    const updated = await this.prismaService.user.findUniqueOrThrow({
      where: { id: botId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
        role: true,
        isBot: true,
        botConfig: true,
        createdAt: true,
      },
    });

    return {
      ...updated,
      kind: isAgentBot(updated) ? 'AGENT_BOT' : 'UNKNOWN',
    };
  }

  async deleteBot(botId: string) {
    const bot = await this.prismaService.user.findFirst({
      where: { id: botId, role: UserRole.CLI_BOT, isBot: true },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found.');
    }

    await this.prismaService.$transaction([
      this.prismaService.user.update({
        where: { id: botId },
        data: { disabledAt: new Date() },
      }),
      this.prismaService.groupMember.deleteMany({
        where: { userId: botId },
      }),
      this.prismaService.refreshToken.updateMany({
        where: { userId: botId },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.logger.log('bot_disabled', JSON.stringify({ botId }));
    return { success: true };
  }

  async assertBotExists(botId: string) {
    const bot = await this.prismaService.user.findFirst({
      where: { id: botId, role: UserRole.CLI_BOT, isBot: true },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found.');
    }
  }

  async handleIncomingMessage(
    botUserId: string,
    groupId: string,
    fromUserId: string,
    fromUserName: string,
    messageText: string,
    sourceEventId: string,
  ): Promise<void> {
    const bot = await this.prismaService.user.findFirst({
      where: { id: botUserId, role: UserRole.CLI_BOT, isBot: true },
      select: { id: true, displayName: true, role: true, isBot: true, botConfig: true },
    });

    if (!bot) return;

    const cfg = resolveBotConfig(bot.botConfig as BotConfig | null);
    if (!canTriggerBotReply(bot, cfg)) return;

    if (!cfg.authToken.trim()) {
      throw new Error('OpenClaw auth token is missing.');
    }

    const contextMessages = await this.buildContext(groupId, botUserId);
    const claim = await this.replyDeliveries.claim(botUserId, groupId, sourceEventId);
    if (claim.state === 'TERMINAL') return;

    let reply = claim.state === 'GENERATED' ? claim.responseText : null;
    if (claim.state === 'ACQUIRED') {
      try {
        reply = await this.callOpenClaw(cfg, contextMessages, messageText, fromUserName);
      } catch (error) {
        await this.replyDeliveries
          .markAmbiguous(botUserId, sourceEventId, error)
          .catch((markError) => {
            this.logger.error(
              'bot_reply_ambiguous_state_persist_failed',
              JSON.stringify({ botUserId, groupId, error: String(markError) }),
            );
          });
        this.logger.error(
          'bot_reply_failed',
          JSON.stringify({ botUserId, groupId, error: String(error) }),
        );
        throw error;
      }

      if (!reply) {
        await this.replyDeliveries.markCompleted(botUserId, sourceEventId);
        return;
      }
      await this.replyDeliveries.storeGenerated(botUserId, sourceEventId, reply);
    }

    if (!reply) return;
    try {
      await this.messagesService.createMessage(botUserId, groupId, {
        type: 'text' as any,
        text: reply,
        clientMessageId: sourceEventId,
      });
      await this.replyDeliveries.markCompleted(botUserId, sourceEventId);
    } catch (error) {
      this.logger.error(
        'bot_reply_delivery_failed',
        JSON.stringify({ botUserId, groupId, error: String(error) }),
      );
      throw error;
    }
  }

  private async buildContext(groupId: string, botUserId: string): Promise<OpenClawMessage[]> {
    const messages = await this.prismaService.message.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      take: MAX_CONTEXT_MESSAGES,
      select: { text: true, senderId: true },
    });

    return messages
      .filter((m) => m.text)
      .map((m) => ({
        role: m.senderId === botUserId ? ('assistant' as const) : ('user' as const),
        content: m.text!,
      }));
  }

  private async callOpenClaw(
    cfg: Required<BotConfig>,
    context: OpenClawMessage[],
    userMessage: string,
    userName: string,
  ): Promise<string | null> {
    if (!cfg.authToken.trim()) {
      throw new Error('OpenClaw auth token is missing.');
    }

    const messages: OpenClawMessage[] = [
      ...(cfg.systemPrompt ? [{ role: 'system' as const, content: cfg.systemPrompt }] : []),
      ...context,
      { role: 'user', content: userMessage },
    ];

    const response = await fetch(
      new URL('v1/chat/completions', `${cfg.gatewayUrl.replace(/\/+$/, '')}/`).toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.authToken}`,
        },
        body: JSON.stringify({
          model: `openclaw/${cfg.openclawAgentId}`,
          messages,
          max_tokens: 4000,
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`OpenClaw returned ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content?.trim() ?? null;
  }

  private assertAllowedGatewayUrl(gatewayUrl: string) {
    const allowedUrls = this.getAllowedGatewayUrls();
    const normalizedGatewayUrl = this.normalizeGatewayUrl(gatewayUrl);

    if (!allowedUrls.has(normalizedGatewayUrl)) {
      throw new BadRequestException('Gateway URL must match an approved OpenClaw endpoint.');
    }
  }

  private getAllowedGatewayUrls(): Set<string> {
    const configured = (process.env.BOT_GATEWAY_ALLOWED_URLS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const values = configured.length > 0 ? configured : DEFAULT_ALLOWED_GATEWAY_URLS;
    return new Set(values.map((value) => this.normalizeGatewayUrl(value)));
  }

  private normalizeGatewayUrl(gatewayUrl: string): string {
    let parsed: URL;
    try {
      parsed = new URL(gatewayUrl);
    } catch {
      throw new BadRequestException('Gateway URL must be an absolute http or https URL.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Gateway URL must use http or https.');
    }
    if (parsed.username || parsed.password) {
      throw new BadRequestException('Gateway URL must not contain credentials.');
    }
    if (parsed.search || parsed.hash) {
      throw new BadRequestException('Gateway URL must not contain query parameters or fragments.');
    }

    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  }
}
