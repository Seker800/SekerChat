import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Max, Min, ValidateNested } from 'class-validator';
import { MAX_UPLOAD_PARTS } from '../upload-limits';

export class CompletedUploadPartDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_PARTS)
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
