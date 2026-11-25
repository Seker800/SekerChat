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
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MessageListResponseDto, MessageResponseDto } from './dto/message-response.dto';
import { GroupMessageActivityResponseDto } from './dto/message-activity-response.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('messages')
@Controller('groups/:groupId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

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

  @Get('activity')
  @ApiOkResponse({ type: GroupMessageActivityResponseDto })
  getMessageActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.messagesService.getMessageActivity(user.sub, groupId, user.role);
  }

  @Post()
  @ApiCreatedResponse({ type: MessageResponseDto })
  createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.createMessage(user.sub, groupId, dto);
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
