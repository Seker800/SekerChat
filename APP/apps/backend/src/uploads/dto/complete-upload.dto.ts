import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Max, Min, ValidateNested } from 'class-validator';

export class CompletedUploadPartDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber!: number;

  @IsString()
  etag!: string;
}

export class CompleteUploadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompletedUploadPartDto)
  parts!: CompletedUploadPartDto[];
}
