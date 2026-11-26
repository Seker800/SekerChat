import { IsBoolean } from 'class-validator';

export class SetServerHiddenDto {
  @IsBoolean()
  hidden!: boolean;
}
