import { IsString, Matches, MaxLength } from 'class-validator';

export class AdvanceReadCursorDto {
  @IsString()
  @MaxLength(19)
  @Matches(/^[1-9]\d*$/, { message: 'eventSequence must be a positive integer string.' })
  eventSequence!: string;
}
