import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { ObjectStorageGateway } from './object-storage.gateway';
import { MediaVideoMetadata, parseBrowserCompatibleMp4Probe } from './media-video-policy';

const execFileAsync = promisify(execFile);

@Injectable()
export class MediaVideoService {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly processingQueue: Array<() => void> = [];
  private activeProcessingCount = 0;
  private static readonly MAX_CONCURRENT_PROCESSING = 2;

  constructor(
    config: ConfigService,
    private readonly objects: ObjectStorageGateway,
  ) {
    this.ffmpegPath = config.get<string>('FFMPEG_PATH')?.trim() || 'ffmpeg';
    this.ffprobePath = config.get<string>('FFPROBE_PATH')?.trim() || 'ffprobe';
  }

  inspect(storageKey: string): Promise<MediaVideoMetadata> {
    return this.withLocalVideo(storageKey, (inputPath) => this.inspectLocalVideo(inputPath));
  }

  inspectAndHash(storageKey: string): Promise<MediaVideoMetadata & { sha256: string }> {
    return this.withLocalVideo(
      storageKey,
      async (inputPath, _directory, sha256) => ({
        ...(await this.inspectLocalVideo(inputPath)),
        sha256: sha256!,
      }),
      true,
    );
  }

  generatePoster(storageKey: string): Promise<Buffer> {
    return this.withLocalVideo(storageKey, async (inputPath, directory) => {
      const outputPath = join(directory, 'poster.jpg');
      await execFileAsync(
        this.ffmpegPath,
        [
          '-v',
          'error',
          '-y',
          '-ss',
          '0',
          '-i',
          inputPath,
          '-frames:v',
          '1',
          '-vf',
          "scale='min(800,iw)':'min(800,ih)':force_original_aspect_ratio=decrease",
          '-q:v',
          '3',
          outputPath,
        ],
        { timeout: 120_000 },
      );
      return readFile(outputPath);
    });
  }

  private async withLocalVideo<T>(
    storageKey: string,
    operation: (inputPath: string, directory: string, sha256?: string) => Promise<T>,
    computeSha256 = false,
  ): Promise<T> {
    const release = await this.acquireProcessingSlot();
    let directory: string | null = null;
    try {
      directory = await mkdtemp(join(tmpdir(), 'sekerchat-media-video-'));
      const inputPath = join(directory, 'input.mp4');
      const { stream } = await this.objects.get(storageKey);
      const hash = computeSha256 ? createHash('sha256') : null;
      const hashTap = hash
        ? new Transform({
            transform(chunk, _encoding, callback) {
              hash.update(chunk);
              callback(null, chunk);
            },
          })
        : null;
      if (hashTap) {
        await pipeline(stream, hashTap, createWriteStream(inputPath, { flags: 'wx' }));
      } else {
        await pipeline(stream, createWriteStream(inputPath, { flags: 'wx' }));
      }
      return await operation(inputPath, directory, hash?.digest('hex'));
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        release();
      }
    }
  }

  private acquireProcessingSlot(): Promise<() => void> {
    return new Promise((resolve) => {
      const acquire = () => {
        this.activeProcessingCount += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.activeProcessingCount -= 1;
          this.processingQueue.shift()?.();
        });
      };
      if (this.activeProcessingCount < MediaVideoService.MAX_CONCURRENT_PROCESSING) acquire();
      else this.processingQueue.push(acquire);
    });
  }

  private async inspectLocalVideo(inputPath: string): Promise<MediaVideoMetadata> {
    try {
      const { stdout } = await execFileAsync(
        this.ffprobePath,
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath],
        { maxBuffer: 2 * 1024 * 1024, timeout: 60_000 },
      );
      return parseBrowserCompatibleMp4Probe(JSON.parse(stdout));
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const processError = error as NodeJS.ErrnoException & { killed?: boolean };
      if (processError.code === 'ENOENT' || processError.killed) {
        throw new ServiceUnavailableException('视频检测暂时不可用，请稍后重试。');
      }
      throw new BadRequestException('无法读取该 MP4 视频，请确认文件完整且编码受支持。');
    }
  }
}
