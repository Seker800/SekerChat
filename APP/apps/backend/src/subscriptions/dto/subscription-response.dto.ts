export class SubscriptionAuthorResponseDto {
  id!: string;
  displayName!: string | null;
  email!: string;
}

export class SubscriptionAttachmentResponseDto {
  id!: string;
  originalName!: string;
  mimeType!: string;
  size!: number;
  sha256!: string | null;
  downloadCount!: number;
  usage!: 'INLINE_IMAGE' | 'DOWNLOADABLE_FILE';
}

export class SubscriptionConfirmationProgressResponseDto {
  confirmedCount!: number;
  recipientCount!: number;
}

export class SubscriptionPostSummaryResponseDto {
  id!: string;
  status!: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';
  title!: string;
  bodyPreview!: string;
  tags!: string[];
  isPinned!: boolean;
  isConfirmed!: boolean;
  isRecipient!: boolean;
  confirmedAt!: string | null;
  confirmationProgress!: SubscriptionConfirmationProgressResponseDto | null;
  /** @deprecated Use isConfirmed. */
  isRead?: boolean;
  publishedAt!: string | null;
  updatedAt!: string;
  author!: SubscriptionAuthorResponseDto;
  attachmentCount!: number;
  hasAttachments!: boolean;
}

export class SubscriptionPostResponseDto {
  id!: string;
  status!: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';
  title!: string;
  body!: string;
  tags!: string[];
  isPinned!: boolean;
  isConfirmed!: boolean;
  isRecipient!: boolean;
  confirmedAt!: string | null;
  confirmationProgress!: SubscriptionConfirmationProgressResponseDto | null;
  /** @deprecated Use isConfirmed. */
  isRead?: boolean;
  publishedAt!: string | null;
  updatedAt!: string;
  author!: SubscriptionAuthorResponseDto;
  attachments!: SubscriptionAttachmentResponseDto[];
}

export class SubscriptionListResponseDto {
  items!: SubscriptionPostSummaryResponseDto[];
  pendingConfirmationCount!: number;
  /** @deprecated Use pendingConfirmationCount. */
  unreadCount?: number;
}

export class SubscriptionManageListResponseDto {
  items!: SubscriptionPostResponseDto[];
}

export class SubscriptionSummaryResponseDto {
  pendingConfirmationCount!: number;
  /** @deprecated Use pendingConfirmationCount. */
  unreadCount?: number;
}

export class SubscriptionConfirmationResponseDto {
  isConfirmed!: boolean;
  confirmedAt!: string;
  pendingConfirmationCount!: number;
}

export class SubscriptionConfirmationMemberResponseDto {
  userId!: string;
  displayName!: string | null;
  email!: string;
  confirmedAt?: string;
}

export class SubscriptionConfirmationsResponseDto {
  postId!: string;
  confirmedCount!: number;
  recipientCount!: number;
  confirmed!: SubscriptionConfirmationMemberResponseDto[];
  pending!: SubscriptionConfirmationMemberResponseDto[];
}

export class DeleteSubscriptionResponseDto {
  postId!: string;
  deleted!: boolean;
}

export class AttachmentDownloadUrlResponseDto {
  url!: string;
  originalName!: string;
  mimeType!: string;
  size!: number;
}

export class AttachmentViewUrlResponseDto extends AttachmentDownloadUrlResponseDto {}
