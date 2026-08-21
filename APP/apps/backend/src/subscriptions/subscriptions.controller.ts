import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  Put,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  parseRangeHeader,
  RangeNotSatisfiableException,
  setPartialContentHeaders,
  setRangeNotSatisfiableHeaders,
} from '../common/range-parser';
import {
  CreateSubscriptionPostDto,
  ListSubscriptionPostsQueryDto,
  PinSubscriptionPostDto,
  UpdateSubscriptionPostDto,
} from './dto/upsert-subscription-post.dto';
import { SubscriptionsService } from './subscriptions.service';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  AttachmentDownloadUrlResponseDto,
  AttachmentViewUrlResponseDto,
  DeleteSubscriptionResponseDto,
  SubscriptionListResponseDto,
  SubscriptionManageListResponseDto,
  SubscriptionPostResponseDto,
  SubscriptionConfirmationResponseDto,
  SubscriptionConfirmationsResponseDto,
  SubscriptionSummaryResponseDto,
} from './dto/subscription-response.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('subscriptions')
@ApiExtraModels(SubscriptionListResponseDto, SubscriptionManageListResponseDto)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/SubscriptionListResponseDto' },
        { $ref: '#/components/schemas/SubscriptionManageListResponseDto' },
      ],
    },
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSubscriptionPostsQueryDto) {
    return query.manage === 'true'
      ? this.subscriptionsService.listManageable(user, query.status)
      : this.subscriptionsService.listPublished(user);
  }

  @Get('summary')
  @ApiOkResponse({ type: SubscriptionSummaryResponseDto })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.getSummary(user.sub);
  }

  @Get(':postId')
  @ApiOkResponse({ type: SubscriptionPostResponseDto })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.subscriptionsService.getPublishedPost(user, postId);
  }

  @Get(':postId/confirmations')
  @ApiOkResponse({ type: SubscriptionConfirmationsResponseDto })
  confirmations(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.subscriptionsService.getConfirmations(user, postId);
  }

  @Put(':postId/confirmation')
  @ApiOkResponse({ type: SubscriptionConfirmationResponseDto })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.subscriptionsService.confirm(user.sub, postId, idempotencyKey);
  }

  @Post()
  @ApiCreatedResponse({ type: SubscriptionPostResponseDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSubscriptionPostDto) {
    return this.subscriptionsService.createDraft(user, dto);
  }

  @Patch(':postId')
  @ApiOkResponse({ type: SubscriptionPostResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body() dto: UpdateSubscriptionPostDto,
  ) {
    return this.subscriptionsService.updatePost(user, postId, dto);
  }

  @Post(':postId/publish')
  @ApiCreatedResponse({ type: SubscriptionPostResponseDto })
  publish(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.subscriptionsService.publish(user, postId);
  }

  @Post(':postId/withdraw')
  @ApiCreatedResponse({ type: SubscriptionPostResponseDto })
  withdraw(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.subscriptionsService.withdraw(user, postId);
  }

  @Post(':postId/pin')
  @ApiCreatedResponse({ type: SubscriptionPostResponseDto })
  pin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body() body: PinSubscriptionPostDto,
  ) {
    return this.subscriptionsService.setPinned(user, postId, body.pinned);
  }

  @Delete(':postId')
  @ApiOkResponse({ type: DeleteSubscriptionResponseDto })
  delete(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.subscriptionsService.deletePost(user, postId);
  }

  @Post(':postId/read')
  @ApiCreatedResponse({ type: SubscriptionSummaryResponseDto, description: 'Deprecated.' })
  read(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.subscriptionsService.markRead(user.sub, postId);
  }

  @Delete(':postId/read')
  @ApiOkResponse({ type: SubscriptionSummaryResponseDto, description: 'Deprecated.' })
  unread(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return this.subscriptionsService.markUnread(user.sub, postId);
  }

  @Post('read/all')
  @ApiCreatedResponse({ type: SubscriptionSummaryResponseDto, description: 'Deprecated.' })
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.markAllRead(user.sub);
  }

  @Get('attachments/:attachmentId/download-url')
  @ApiOkResponse({ type: AttachmentDownloadUrlResponseDto })
  downloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('attachmentId') attachmentId: string) {
    return this.subscriptionsService.getAttachmentDownloadUrl(user.sub, attachmentId);
  }

  @Get('attachments/:attachmentId/view-url')
  @ApiOkResponse({ type: AttachmentViewUrlResponseDto })
  viewUrl(@CurrentUser() user: AuthenticatedUser, @Param('attachmentId') attachmentId: string) {
    return this.subscriptionsService.getAttachmentViewUrl(user, attachmentId);
  }

  @Get('attachments/:attachmentId/content')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId') attachmentId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    let range: string | undefined;
    try {
      range = parseRangeHeader(rangeHeader);
    } catch {
      response.status(416);
      return;
    }

    let result: Awaited<ReturnType<SubscriptionsService['getAttachmentStream']>>;
    try {
      result = await this.subscriptionsService.getAttachmentStream(user.sub, attachmentId, range);
    } catch (error) {
      if (error instanceof RangeNotSatisfiableException) {
        setRangeNotSatisfiableHeaders(response, error.fullSize);
        return;
      }
      throw error;
    }

    const fallbackName =
      result.attachment.originalName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') ||
      'download';
    const encodedName = encodeURIComponent(result.attachment.originalName)
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');
    response.setHeader('Content-Type', result.attachment.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    );
    response.setHeader('Cache-Control', 'private, max-age=60');
    setPartialContentHeaders(
      response,
      range,
      result.contentRange,
      result.contentLength,
      Number(result.attachment.size),
    );
    return new StreamableFile(result.stream);
  }
}
