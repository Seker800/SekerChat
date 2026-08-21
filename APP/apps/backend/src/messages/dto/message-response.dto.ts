export class MessageSenderResponseDto {
  id!: string;
  email!: string;
  displayName!: string | null;
  avatarUrl!: string | null;
}

export class MessageAttachmentResponseDto {
  id!: string;
  fileId!: string;
  groupId!: string;
  originalName!: string;
  mimeType!: string;
  size!: number;
  width?: number | null;
  height?: number | null;
  createdAt!: string;
  contentUrl!: string;
  metadataUrl!: string;
  uploaderId!: string;
  kind!: 'image' | 'file';
  thumbnailUrl!: string | null;
  isSharing?: boolean;
}

export class MessageReplyResponseDto {
  id!: string;
  senderId!: string;
  type!: 'text' | 'image' | 'file' | 'system';
  textPreview!: string | null;
  sender!: MessageSenderResponseDto;
  attachment!: MessageAttachmentResponseDto | null;
}

export class MessageReadReceiptMemberResponseDto {
  userId!: string;
  email!: string;
  displayName!: string | null;
  avatarUrl!: string | null;
}

export class MessageReadReceiptResponseDto {
  totalRecipients!: number;
  readCount!: number;
  unreadCount!: number;
  readBy!: MessageReadReceiptMemberResponseDto[];
  unreadBy!: MessageReadReceiptMemberResponseDto[];
}

export class MessageResponseDto {
  id!: string;
  eventSequence!: string;
  groupId!: string;
  senderId!: string;
  type!: 'text' | 'image' | 'file' | 'system';
  text!: string | null;
  revokedAt!: string | null;
  editedAt!: string | null;
  mentionedUserIds!: string[];
  replyTo!: MessageReplyResponseDto | null;
  attachment!: MessageAttachmentResponseDto | null;
  readReceipt!: MessageReadReceiptResponseDto | null;
  createdAt!: string;
  sender!: MessageSenderResponseDto;
}

export class MessageListResponseDto {
  groupId!: string;
  items!: MessageResponseDto[];
  nextCursor?: string | null;
}
