import { IsEmail } from 'class-validator';

export class InviteGroupMemberDto {
  @IsEmail()
  email!: string;
}
