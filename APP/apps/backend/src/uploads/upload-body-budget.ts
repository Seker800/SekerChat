import type { RequestHandler } from 'express';

/** Admit before express.raw: a Nest interceptor runs after body allocation. */
export function createUploadBodyBudget(limit = 12): RequestHandler {
  let active = 0;
  return (_request, response, next) => {
    if (active >= limit) {
      response.setHeader('Retry-After', '2');
      response.status(429).json({ code: 'UPLOAD_BUSY', message: '上传处理繁忙，请稍后重试。' });
      return;
    }
    active++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active--;
    };
    response.once('finish', release);
    response.once('close', release);
    next();
  };
}
