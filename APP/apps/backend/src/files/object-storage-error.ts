type AwsErrorMetadata = {
  httpStatusCode?: number;
  requestId?: string;
  extendedRequestId?: string;
  attempts?: number;
  totalRetryDelay?: number;
};

type AwsLikeError = Error & {
  Code?: string;
  code?: string;
  $fault?: string;
  $retryable?: { throttling?: boolean } | boolean;
  $metadata?: AwsErrorMetadata;
  cause?: Error & { Code?: string; code?: string };
};

export function objectStorageErrorDetails(operation: string, error: unknown, durationMs: number) {
  const candidate = error as Partial<AwsLikeError>;
  const metadata = candidate?.$metadata;
  const retryable = candidate?.$retryable;
  const cause = candidate?.cause;
  return compact({
    operation,
    errorName: candidate?.name,
    errorCode: candidate?.Code ?? candidate?.code,
    fault: candidate?.$fault,
    sdkRetryable: retryable === undefined ? undefined : Boolean(retryable),
    throttling:
      typeof retryable === 'object' && retryable !== null
        ? retryable.throttling
        : undefined,
    causeName: cause?.name,
    causeCode: cause?.Code ?? cause?.code,
    httpStatusCode: metadata?.httpStatusCode,
    requestId: metadata?.requestId,
    extendedRequestId: metadata?.extendedRequestId,
    attempts: metadata?.attempts,
    totalRetryDelayMs: metadata?.totalRetryDelay,
    durationMs: Math.max(0, Math.round(durationMs)),
  });
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, candidate]) => candidate !== undefined),
  ) as Partial<T>;
}
