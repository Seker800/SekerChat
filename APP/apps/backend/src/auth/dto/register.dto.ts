import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])/, { message: '密码需包含至少一个大写字母' })
  @Matches(/(?=.*[a-z])/, { message: '密码需包含至少一个小写字母' })
  @Matches(/(?=.*[0-9])/, { message: '密码需包含至少一个数字' })
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}
