import { IsString, Matches, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])/, { message: '临时密码需要至少包含一个大写字母' })
  @Matches(/(?=.*[a-z])/, { message: '临时密码需要至少包含一个小写字母' })
  @Matches(/(?=.*[0-9])/, { message: '临时密码需要至少包含一个数字' })
  newPassword!: string;
}
