import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class ListAlbumPhotosDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
export class UpdateAlbumTagsDto {
  @IsArray() @IsString({ each: true }) tags!: string[];
}
export class DeleteAlbumPhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  photoIds!: string[];
}

export class AlbumUpdateStatusResponseDto {
  hasUpdates!: boolean;
}

export class AlbumPhotoResponseDto {
  id!: string;
  mediaType!: 'image' | 'video';
  mimeType!: string;
  durationMs!: number | null;
  width!: number;
  height!: number;
  createdAt!: string;
  contentUrl!: string;
  thumbnailUrl!: string | null;
}

export class AlbumPhotoListResponseDto {
  @ApiProperty({ type: [AlbumPhotoResponseDto] })
  items!: AlbumPhotoResponseDto[];
  nextCursor!: string | null;
}

export class AlbumTagResponseDto {
  id!: string;
  name!: string;
  normalizedName!: string;
  photoCount!: number;
}

export class AlbumManagePhotoResponseDto {
  photoId!: string;
  @ApiProperty({ type: [AlbumTagResponseDto] })
  tags!: AlbumTagResponseDto[];
}

export class AlbumUpdateTagsResponseDto extends AlbumManagePhotoResponseDto {}

export class AlbumDeleteResponseDto {
  photoId!: string;
  deleted!: boolean;
}

export class AlbumBatchDeleteResponseDto {
  requestedCount!: number;
  deletedCount!: number;
}

export class AlbumViewUrlResponseDto {
  url!: string;
  mimeType!: string;
  size!: number;
  expiresAt!: string;
}
