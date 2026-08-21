export class ServerResponseDto {
  id!: string;
  name!: string;
  avatarUrl!: string | null;
  archivedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class ArchiveServerResponseDto {
  serverId!: string;
  name!: string;
  category!: string;
  archivedAt!: string | null;
  groupCount!: number;
}
