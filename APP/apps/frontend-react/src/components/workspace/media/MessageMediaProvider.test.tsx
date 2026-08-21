import { useEffect, useRef, useState } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageMediaProvider, useMessageMediaScheduler } from './MessageMediaProvider';

const observerInstances: FakeIntersectionObserver[] = [];

class FakeIntersectionObserver {
  readonly targets = new Set<Element>();

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    observerInstances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  emitIntersecting() {
    this.callback([...this.targets].map((target) => ({
      target,
      isIntersecting: true,
    } as IntersectionObserverEntry)), this as unknown as IntersectionObserver);
  }
}

function MediaProbe({ id, bottom, started }: { id: string; bottom: number; started: string[] }) {
  const schedule = useMessageMediaScheduler();
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!schedule || !element) return undefined;
    return schedule({
      id,
      element,
      run: async () => {
        started.push(id);
      },
    });
  }, [element, id, schedule, started]);

  return (
    <div
      ref={(node) => {
        if (node) {
          node.getBoundingClientRect = () => ({
            top: bottom - 100,
            bottom,
          } as DOMRect);
        }
        setElement(node);
      }}
    />
  );
}

function Harness({ started }: { started: string[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        if (node) {
          node.getBoundingClientRect = () => ({ top: 0, bottom: 1000 } as DOMRect);
        }
      }}
    >
      <MessageMediaProvider rootRef={rootRef} scopeKey="group-1">
        <MediaProbe id="oldest-visible" bottom={200} started={started} />
        <MediaProbe id="newest-visible" bottom={900} started={started} />
        <MediaProbe id="below-viewport" bottom={1500} started={started} />
      </MessageMediaProvider>
    </div>
  );
}

describe('MessageMediaProvider', () => {
  afterEach(() => {
    cleanup();
    observerInstances.length = 0;
    vi.unstubAllGlobals();
  });

  it('uses one observer and only prefetches the viewport above the message pane', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const started: string[] = [];
    render(<Harness started={started} />);

    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0]!.options?.rootMargin).toBe('100% 0px 0px 0px');
    observerInstances[0]!.emitIntersecting();

    await waitFor(() => {
      expect(started).toEqual(['newest-visible', 'oldest-visible']);
    });
  });
});
