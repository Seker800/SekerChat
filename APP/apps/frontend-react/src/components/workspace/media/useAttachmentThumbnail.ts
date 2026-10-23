import { useEffect, useState } from 'react';
import {
  bearerHeader,
  fetchApi,
  parseResponse,
  resolveApiResourceUrl,
} from '../../../lib/api-core';

type ThumbnailState = {
  thumbnailUrl: string | null;
  thumbnailStatus?: string;
  thumbnailError?: string | null;
};

export function useAttachmentThumbnail(options: {
  src: string;
  contentUrl?: string;
  status?: string;
  error?: string | null;
  accessToken?: string;
  element: HTMLElement | null;
}) {
  const { src, contentUrl, status, error, accessToken, element } = options;
  const [state, setState] = useState<ThumbnailState>({
    thumbnailUrl: src,
    thumbnailStatus: status,
    thumbnailError: error,
  });
  const [visible, setVisible] = useState(false);
  const [retryError, setRetryError] = useState('');
  const metadataUrl = contentUrl?.replace(/\/content(?:\?.*)?$/, '');

  useEffect(() => {
    setState({ thumbnailUrl: src, thumbnailStatus: status, thumbnailError: error });
    setRetryError('');
  }, [src, contentUrl, status, error]);

  useEffect(() => {
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '600px',
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  useEffect(() => {
    if (
      state.thumbnailUrl ||
      !visible ||
      !metadataUrl ||
      metadataUrl === contentUrl ||
      !['PENDING', 'PROCESSING'].includes(state.thumbnailStatus ?? '')
    )
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetchApi(metadataUrl, {
          headers: bearerHeader(accessToken),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('缩略图状态暂时无法读取');
        const next = await parseResponse<ThumbnailState>(response);
        if (controller.signal.aborted) return;
        setState(next);
        if (!next.thumbnailUrl && ['PENDING', 'PROCESSING'].includes(next.thumbnailStatus ?? ''))
          timer = setTimeout(poll, 3000);
      } catch {
        if (!controller.signal.aborted) timer = setTimeout(poll, 10000);
      }
    };
    timer = setTimeout(poll, 3000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [accessToken, contentUrl, metadataUrl, state.thumbnailStatus, state.thumbnailUrl, visible]);

  const canRetry = state.thumbnailStatus === 'FAILED' || state.thumbnailStatus === 'UNAVAILABLE';
  const message =
    retryError ||
    (state.thumbnailStatus === 'PENDING' || state.thumbnailStatus === 'PROCESSING'
      ? state.thumbnailError
        ? '缩略图生成失败，正在重试；点击查看原图'
        : '缩略图生成中，点击查看原图'
      : state.thumbnailError || '缩略图不可用，点击查看原图');

  async function retry() {
    if (!metadataUrl || metadataUrl === contentUrl) return;
    setRetryError('');
    try {
      const response = await fetchApi(`${metadataUrl}/preview/retry`, {
        method: 'POST',
        headers: bearerHeader(accessToken),
      });
      if (!response.ok) throw new Error('重试失败，请稍后再试');
      setState(await parseResponse<ThumbnailState>(response));
    } catch {
      setRetryError('重试失败，请稍后再试；点击查看原图');
    }
  }
  return {
    src: state.thumbnailUrl ? resolveApiResourceUrl(state.thumbnailUrl) : '',
    canRetry,
    message,
    retry,
  };
}
