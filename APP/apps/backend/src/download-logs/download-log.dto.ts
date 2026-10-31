import { IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const MAX_BYTES = 5 * 1024 ** 4;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

export class DownloadLogDto {
  @IsUUID()
  downloadId!: string;

  @IsIn(['file', 'artifact', 'article_attachment', 'album_photo'])
  resourceKind!: 'file' | 'artifact' | 'article_attachment' | 'album_photo';

  @Matches(/^[a-zA-Z0-9_-]{1,128}$/)
  resourceId!: string;

  @IsIn(['started', 'progress', 'completed', 'failed', 'cancelled'])
  event!: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';

  @IsInt()
  @Min(0)
  @Max(MAX_BYTES)
  bytes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_BYTES)
  expectedBytes!: number | null;

  @IsInt()
  @Min(0)
  @Max(MAX_DURATION_MS)
  elapsedMs!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DURATION_MS)
  firstByteMs!: number | null;

  @IsInt()
  @Min(0)
  @Max(MAX_DURATION_MS)
  maxGapMs!: number;

  @IsIn(['unknown', 'browser_cache', 'network'])
  cacheStatus!: 'unknown' | 'browser_cache' | 'network';

  @IsOptional()
  @IsIn(['network', 'http', 'timeout', 'aborted'])
  errorCode!: string | null;
}
