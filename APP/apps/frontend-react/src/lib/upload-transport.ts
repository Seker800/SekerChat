/** XHR supplies browser byte progress; auth/refresh remains owned by fetchApi. */
export function sendUploadRequest(
  url: string,
  init: RequestInit,
  onProgress?: (loaded: number) => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    let lastLoaded = 0;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      fail(new DOMException('Upload aborted', 'AbortError'));
      xhr.abort();
    };
    const armWatchdog = (ms: number, message: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fail(new Error(message));
        xhr.abort();
      }, ms);
    };
    xhr.upload.addEventListener('progress', (event) => {
      if (settled || event.loaded <= lastLoaded) return;
      lastLoaded = event.loaded;
      armWatchdog(45_000, '上传连续 45 秒没有进展，请检查网络后重试。');
      onProgress?.(event.loaded);
    });
    xhr.upload.addEventListener('load', () => {
      if (!settled) armWatchdog(120_000, '服务器确认上传超时，请稍后重试。');
    });
    xhr.addEventListener('error', () => fail(new Error('上传网络连接中断，请检查网络后重试。')));
    xhr.addEventListener('abort', () => fail(new DOMException('Upload aborted', 'AbortError')));
    xhr.addEventListener('load', () => {
      if (settled) return;
      try {
        const headers = new Headers();
        for (const line of xhr
          .getAllResponseHeaders()
          .trim()
          .split(/[\r\n]+/)) {
          const separator = line.indexOf(':');
          if (separator > 0)
            headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
        }
        const response = new Response(xhr.responseText, { status: xhr.status, headers });
        settled = true;
        cleanup();
        resolve(response);
      } catch (error) {
        fail(error);
      }
    });
    try {
      xhr.open(init.method ?? 'PUT', url);
      xhr.withCredentials = init.credentials === 'include';
      new Headers(init.headers).forEach((value, name) => xhr.setRequestHeader(name, value));
      signal?.addEventListener('abort', onAbort, { once: true });
      armWatchdog(45_000, '上传连续 45 秒没有进展，请检查网络后重试。');
      onProgress?.(0);
      xhr.send(init.body as Blob);
    } catch (error) {
      fail(error);
    }
  });
}

export function waitForUploadRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Upload aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
