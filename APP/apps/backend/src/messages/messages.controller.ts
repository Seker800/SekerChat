import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateMessageDto } from './dto/create-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { MessagesService } from './messages.service';
import { SendMessageUseCase } from './send-message.use-case';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MessageListResponseDto, MessageResponseDto } from './dto/message-response.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('messages')
@Controller('groups/:groupId/messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly sendMessageUseCase: SendMessageUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: MessageListResponseDto })
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    let parsedLimit: number | undefined;
    if (limit?.trim()) {
      parsedLimit = Number(limit);
      if (Number.isNaN(parsedLimit) || !Number.isFinite(parsedLimit)) {
        throw new BadRequestException('Limit must be a valid number.');
      }
    }

    return this.messagesService.listMessages(
      user.sub,
      groupId,
      {
        cursor,
        limit: parsedLimit,
      },
      user.role,
    );
  }

  @Post()
  @ApiCreatedResponse({ type: MessageResponseDto })
  createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.sendMessageUseCase.execute(user.sub, groupId, dto);
  }

  @Patch(':messageId')
  @ApiOkResponse({ type: MessageResponseDto })
  editMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagesService.editMessage(user.sub, groupId, messageId, dto.text);
  }

  @Post(':messageId/revoke')
  @ApiCreatedResponse({ type: MessageResponseDto })
  revokeMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.revokeMessage(user.sub, groupId, messageId);
  }
}
