import { IsEnum } from 'class-validator';
import { GroupMemberRole } from '@prisma/client';

export class UpdateGroupMemberRoleDto {
  @IsEnum(GroupMemberRole)
  role!: GroupMemberRole;
}
