import type { RequestHandler } from 'express';

export interface UploadBodyBudgetOptions {
  /** Hard cap on concurrently buffered upload parts across the process. */
  total?: number;
  /** Cap for one client address so a single caller cannot occupy every slot. */
  perClient?: number;
}

const DEFAULT_TOTAL = 12;
const DEFAULT_PER_CLIENT = 8;

/**
 * Admit before express.raw: a Nest interceptor runs after body allocation.
 * The global cap bounds memory; the per-client cap keeps one caller (or one
 * slow request loop) from starving everyone else.
 */
export function createUploadBodyBudget(
  input: number | UploadBodyBudgetOptions = DEFAULT_TOTAL,
): RequestHandler {
  const totalLimit = typeof input === 'number' ? input : (input.total ?? DEFAULT_TOTAL);
  const perClientLimit =
    typeof input === 'number' ? input : (input.perClient ?? DEFAULT_PER_CLIENT);

  let active = 0;
  const activeByClient = new Map<string, number>();

  return (request, response, next) => {
    const client = request.ip?.trim() || 'unknown';
    const clientActive = activeByClient.get(client) ?? 0;

    if (active >= totalLimit || clientActive >= perClientLimit) {
      response.setHeader('Retry-After', '2');
      response.status(429).json({ code: 'UPLOAD_BUSY', message: '上传处理繁忙，请稍后重试。' });
      return;
    }

    active++;
    activeByClient.set(client, clientActive + 1);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active--;
      const remaining = (activeByClient.get(client) ?? 1) - 1;
      if (remaining > 0) activeByClient.set(client, remaining);
      else activeByClient.delete(client);
    };

    response.once('finish', release);
    response.once('close', release);
    next();
  };
}
