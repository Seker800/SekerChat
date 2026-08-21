import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { MessageMediaScheduler, type MediaLoadPriority } from './messageMediaScheduler';

interface ScheduledMediaLoad {
  id: string;
  element: Element;
  run: (signal: AbortSignal) => Promise<void>;
}

type ScheduleMediaLoad = (load: ScheduledMediaLoad) => () => void;

const MessageMediaContext = createContext<ScheduleMediaLoad | null>(null);

interface MessageMediaProviderProps {
  children: ReactNode;
  rootRef: RefObject<HTMLElement | null>;
  scopeKey: string;
}

function getPriority(element: Element, root: HTMLElement): MediaLoadPriority | null {
  const elementRect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  if (elementRect.bottom >= rootRect.top && elementRect.top <= rootRect.bottom) {
    return 'visible';
  }

  const rootHeight = rootRect.bottom - rootRect.top;
  return elementRect.bottom >= rootRect.top - rootHeight && elementRect.top < rootRect.top
    ? 'prefetch'
    : null;
}

export function MessageMediaProvider({ children, rootRef, scopeKey }: MessageMediaProviderProps) {
  const scheduler = useMemo(() => new MessageMediaScheduler(), [scopeKey]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pendingEntriesRef = useRef(new Map<Element, IntersectionObserverEntry>());
  const pendingFrameRef = useRef<number | null>(null);
  const registrationsRef = useRef(new Map<Element, ScheduledMediaLoad & {
    cancelQueued?: () => void;
  }>());
  const schedule = useMemo<ScheduleMediaLoad>(() => (load) => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      return scheduler.enqueue({
        ...load,
        priority: 'immediate',
        bottom: load.element.getBoundingClientRect().bottom,
      });
    }

    const registration = { ...load, cancelQueued: undefined as (() => void) | undefined };
    registrationsRef.current.set(load.element, registration);
    observerRef.current?.observe(load.element);

    return () => {
      observerRef.current?.unobserve(load.element);
      registration.cancelQueued?.();
      registrationsRef.current.delete(load.element);
    };
  }, [rootRef, scheduler]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;

    const flushEntries = () => {
      pendingFrameRef.current = null;
      const entries = [...pendingEntriesRef.current.values()];
      pendingEntriesRef.current.clear();
      for (const entry of entries) {
        const registration = registrationsRef.current.get(entry.target);
        if (!registration) continue;
        registration.cancelQueued?.();
        registration.cancelQueued = undefined;
        if (!entry.isIntersecting) continue;

        const priority = getPriority(registration.element, root);
        if (!priority) continue;
        registration.cancelQueued = scheduler.enqueue({
          ...registration,
          priority,
          bottom: registration.element.getBoundingClientRect().bottom,
        });
      }
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) pendingEntriesRef.current.set(entry.target, entry);
      if (pendingFrameRef.current === null) {
        pendingFrameRef.current = window.requestAnimationFrame(() => {
          pendingFrameRef.current = window.requestAnimationFrame(flushEntries);
        });
      }
    }, {
      root,
      rootMargin: '100% 0px 0px 0px',
      threshold: 0,
    });
    observerRef.current = observer;
    for (const element of registrationsRef.current.keys()) observer.observe(element);

    return () => {
      observer.disconnect();
      observerRef.current = null;
      pendingEntriesRef.current.clear();
      if (pendingFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
    };
  }, [rootRef, scheduler]);

  useEffect(() => () => {
    scheduler.clear({ abortActive: true });
    registrationsRef.current.clear();
  }, [scheduler]);

  return (
    <MessageMediaContext.Provider value={schedule}>
      {children}
    </MessageMediaContext.Provider>
  );
}

export function useMessageMediaScheduler() {
  return useContext(MessageMediaContext);
}
