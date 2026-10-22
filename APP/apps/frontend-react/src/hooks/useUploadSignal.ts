import { useCallback, useEffect, useRef } from 'react';

/** Upload work belongs to its mounted UI scope, including queued files. */
export function useUploadSignal(scope?: string): () => AbortSignal {
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, [scope]);
  return useCallback(() => controller.current.signal, []);
}
