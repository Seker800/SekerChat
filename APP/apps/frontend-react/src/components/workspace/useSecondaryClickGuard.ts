import { useCallback, useRef } from 'react';

const SUPPRESS_WINDOW_MS = 400;

export function useSecondaryClickGuard() {
  const lastSecondaryClickAtRef = useRef(0);

  const markSecondaryClick = useCallback(() => {
    lastSecondaryClickAtRef.current = Date.now();
  }, []);

  const shouldSuppressClick = useCallback(() => {
    return Date.now() - lastSecondaryClickAtRef.current < SUPPRESS_WINDOW_MS;
  }, []);

  return {
    markSecondaryClick,
    shouldSuppressClick,
  };
}
