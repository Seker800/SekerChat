import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { Readable } from 'node:stream';
import { ObjectSizeMismatchError } from './object-size-mismatch.error';
import { objectStorageErrorDetails } from './object-storage-error';
import {
  executeObjectReadWithRetry,
  isRetryableObjectReadError,
} from './object-storage-read-retry';

export type CompletedMultipartPart = { ETag: string; PartNumber: number };
const FILE_VIEW_BROWSER_CACHE_SECONDS = 3300;

@Injectable()
export class ObjectStorageGateway {
  private readonly logger = new Logger(ObjectStorageGateway.name);
  private readonly internalClient: S3Client;
  private readonly readinessClient: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;
  private bucketEnsured: Promise<void> | null = null;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    const region = config.getOrThrow<string>('S3_REGION');
    const forcePathStyle = config.get<boolean>('S3_FORCE_PATH_STYLE') ?? true;
    const credentials = {
      accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
      secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
    };
    this.internalClient = new S3Client({
      region,
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      forcePathStyle,
      credentials,
      requestHandler: new NodeHttpHandler({ requestTimeout: 120_000 }),
    });
    this.readinessClient = new S3Client({
      region,
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      forcePathStyle,
      credentials,
      maxAttempts: 1,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 1_000,
        requestTimeout: 1_500,
        throwOnRequestTimeout: true,
      }),
    });
    const publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT')?.trim();
    this.publicClient = publicEndpoint
      ? new S3Client({ region, endpoint: publicEndpoint, forcePathStyle, credentials })
      : this.internalClient;
  }

  async put(storageKey: string, body: Buffer, mimeType: string): Promise<void> {
    await this.ensureBucket();
    await this.observe('PutObject', () =>
      this.internalClient.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: body,
          ContentType: mimeType,
          ContentLength: body.length,
        }),
      ),
    );
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.ensureBucket();
    const copySource = [this.bucket, ...sourceKey.split('/')]
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    await this.internalClient.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destinationKey,
        CopySource: copySource,
      }),
    );
  }

  async checkReady(): Promise<void> {
    await this.readinessClient.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async delete(storageKey: string): Promise<boolean> {
    try {
      await this.internalClient.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        's3_delete_failed',
        JSON.stringify({ storageKey, error: error instanceof Error ? error.message : 'Unknown' }),
      );
      return false;
    }
  }

  async get(
    storageKey: string,
    options?: { range?: string; ifNoneMatch?: string },
  ): Promise<{
    mimeType: string;
    stream: Readable;
    contentLength: number;
    contentRange?: string;
    etag?: string;
    lastModified?: Date;
  }> {
    const startedAt = performance.now();
    let object;
    try {
      object = await this.observe('GetObject', () =>
        executeObjectReadWithRetry(
          () =>
            this.internalClient.send(
              new GetObjectCommand({
                Bucket: this.bucket,
                Key: storageKey,
                Range: options?.range,
                IfNoneMatch: options?.ifNoneMatch,
              }),
            ),
          {
            onRetry: (error, delayMs) => {
              this.logger.warn(
                'object_storage_read_retry',
                JSON.stringify({
                  ...objectStorageErrorDetails(
                    'GetObject',
                    error,
                    performance.now() - startedAt,
                  ),
                  applicationAttempt: 2,
                  applicationRetryDelayMs: delayMs,
                }),
              );
            },
          },
        ),
      );
    } catch (error) {
      if (isRetryableObjectReadError(error)) {
        throw new ServiceUnavailableException('对象存储暂时不可用，请稍后重试。');
      }
      throw error;
    }
    if (!object.Body) throw new NotFoundException('S3 object not found.');
    return {
      mimeType: object.ContentType ?? 'application/octet-stream',
      stream: object.Body as Readable,
      contentLength: object.ContentLength ?? 0,
      contentRange: object.ContentRange,
      etag: object.ETag,
      lastModified: object.LastModified,
    };
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await this.internalClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return true;
    } catch (error) {
      const awsError = error as Error & { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        awsError.name === 'NotFound' ||
        awsError.name === 'NoSuchKey' ||
        awsError.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw error;
    }
  }

  createViewUrl(storageKey: string, mimeType: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ResponseContentType: mimeType,
        ResponseCacheControl: `private, max-age=${Math.min(FILE_VIEW_BROWSER_CACHE_SECONDS, Math.max(0, expiresInSeconds - 60))}`,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  createDownloadUrl(
    storageKey: string,
    mimeType: string,
    originalName: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const asciiFallback =
      originalName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
    const encoded = encodeURIComponent(originalName)
      .replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
      .replace(/\*/g, '%2A');
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ResponseContentType: mimeType,
        ResponseContentDisposition: `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async assertSize(storageKey: string, expectedSize: number): Promise<void> {
    const result = await this.observe('HeadObject', () =>
      this.internalClient.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey })),
    );
    if (result.ContentLength === undefined) {
      throw new ObjectSizeMismatchError(expectedSize, null);
    }
    if (result.ContentLength !== expectedSize) {
      throw new ObjectSizeMismatchError(expectedSize, result.ContentLength);
    }
  }

  async initiateMultipart(storageKey: string, mimeType: string): Promise<{ uploadId: string }> {
    await this.ensureBucket();
    const result = await this.internalClient.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: mimeType,
      }),
    );
    if (!result.UploadId) throw new ServiceUnavailableException('对象存储未返回上传会话。');
    return { uploadId: result.UploadId };
  }

  async uploadPart(
    storageKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<CompletedMultipartPart> {
    const result = await this.observe('UploadPart', () =>
      this.internalClient.send(
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: storageKey,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: body,
          ContentLength: body.length,
        }),
      ),
    );
    if (!result.ETag) throw new ServiceUnavailableException('对象存储未返回上传分片 ETag。');
    return { ETag: result.ETag.replace(/^"+|"+$/g, ''), PartNumber: partNumber };
  }

  async completeMultipart(
    storageKey: string,
    uploadId: string,
    parts: CompletedMultipartPart[],
  ): Promise<void> {
    await this.observe('CompleteMultipartUpload', () =>
      this.internalClient.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: storageKey,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [...parts]
              .sort((left, right) => left.PartNumber - right.PartNumber)
              .map((part) => ({ ETag: part.ETag, PartNumber: part.PartNumber })),
          },
        }),
      ),
    );
  }

  async abortMultipart(storageKey: string, uploadId: string): Promise<void> {
    await this.internalClient.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: storageKey, UploadId: uploadId }),
    );
  }

  async listParts(
    storageKey: string,
    uploadId: string,
  ): Promise<Array<{ PartNumber: number; ETag: string; Size: number }>> {
    const result = await this.internalClient.send(
      new ListPartsCommand({ Bucket: this.bucket, Key: storageKey, UploadId: uploadId }),
    );
    return (result.Parts ?? []).map((part) => ({
      PartNumber: part.PartNumber!,
      ETag: (part.ETag ?? '').replace(/^"+|"+$/g, ''),
      Size: part.Size ?? 0,
    }));
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return this.bucketEnsured;
    this.bucketEnsured = (async () => {
      try {
        await this.internalClient.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        const awsError = error as Error & {
          name?: string;
          $metadata?: { httpStatusCode?: number };
        };
        if (awsError.name !== 'NotFound' && awsError.$metadata?.httpStatusCode !== 404) {
          this.bucketEnsured = null;
          throw error;
        }
        try {
          await this.internalClient.send(new CreateBucketCommand({ Bucket: this.bucket }));
        } catch (createError) {
          this.bucketEnsured = null;
          throw createError;
        }
      }
    })();
    return this.bucketEnsured;
  }

  private async observe<T>(operation: string, execute: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await execute();
    } catch (error) {
      this.logger.warn(
        'object_storage_operation_failed',
        JSON.stringify(objectStorageErrorDetails(operation, error, performance.now() - startedAt)),
      );
      throw error;
    }
  }
}
