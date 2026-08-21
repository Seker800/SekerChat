export class GroupMemberResponseDto {
  userId!: string;
  email!: string;
  displayName!: string | null;
  avatarUrl!: string | null;
  role!: 'ADMIN' | 'MEMBER';
  joinedAt!: string;
  isOnline!: boolean;
  isDnd!: boolean;
}

export class GroupMessagePreviewResponseDto {
  text!: string | null;
  senderId!: string;
  type!: 'TEXT' | 'IMAGE' | 'FILE';
}

export class GroupWorkStateSummaryResponseDto {
  status!: string;
  updatedAt!: string;
}

export class GroupArtifactConfirmationResponseDto {
  isConfirmed!: boolean;
  confirmedAt!: string | null;
  confirmedByUserId!: string | null;
  confirmedByDisplayName!: string | null;
}

export class GroupServerResponseDto {
  id!: string;
  name!: string;
  avatarUrl!: string | null;
  archivedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class GroupResponseDto {
  id!: string;
  name!: string;
  category!: string;
  serverId?: string | null;
  server?: GroupServerResponseDto | null;
  isDM!: boolean;
  latestMessage!: GroupMessagePreviewResponseDto | null;
  serverAvatarUrl!: string | null;
  workState!: GroupWorkStateSummaryResponseDto | null;
  artifactConfirmation!: GroupArtifactConfirmationResponseDto;
  archivedAt!: string | null;
  categoryArchivedAt?: string | null;
  createdAt!: string;
  updatedAt!: string;
  createdById!: string;
  currentUserRole!: 'ADMIN' | 'MEMBER';
  unreadCount!: number;
  memberCount?: number;
  members!: GroupMemberResponseDto[];
}

export class UserOptionResponseDto {
  id!: string;
  email!: string;
  displayName!: string | null;
  role?: 'ADMIN' | 'MEMBER' | 'SUPER_ADMIN';
}

export class LeaveGroupResponseDto {
  groupId!: string;
  left!: boolean;
  archivedAfterLeave?: boolean;
}

export class MarkGroupReadResponseDto {
  success!: true;
}

export class AdvanceReadCursorResponseDto {
  groupId!: string;
  lastReadEventSequence!: string;
  changed!: boolean;
}

export class ArchiveCategoryResponseDto {
  serverId!: string;
  category!: string;
  archivedAt!: string | null;
  groupCount!: number;
}

export class RenameCategoryResponseDto {
  serverId?: string;
  from!: string;
  to!: string;
  updatedGroupCount!: number;
}

export class ResetCategoryResponseDto {
  serverId?: string;
  reassignedToServerId?: string;
  category!: string;
  reassignedTo!: string;
  updatedGroupCount!: number;
}

export class ManageableCategoryResponseDto {
  serverId!: string;
  name!: string;
  groupCount!: number;
  archivedGroupCount!: number;
  activeGroupCount!: number;
  latestUpdatedAt!: string | null;
}

export class AdminDiscoverableCreatorResponseDto {
  id!: string;
  email!: string;
  displayName!: string | null;
}

export class AdminDiscoverableGroupResponseDto {
  id!: string;
  name!: string;
  category!: string;
  serverId!: string | null;
  server!: GroupServerResponseDto | null;
  serverAvatarUrl!: string | null;
  archivedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  createdBy!: AdminDiscoverableCreatorResponseDto;
  workState!: GroupWorkStateSummaryResponseDto | null;
  memberCount!: number;
  isCurrentUserMember!: boolean;
  currentUserMembershipRole!: 'ADMIN' | 'MEMBER' | null;
  canSelfJoin!: boolean;
  visibilityReason!: 'current_member' | 'archived_admin_override' | 'admin_override';
}
