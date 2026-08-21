import { describe, expect, it, vi } from 'vitest';
import { MessageMediaScheduler } from './messageMediaScheduler';

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('MessageMediaScheduler', () => {
  it('starts visible media from the bottom upward regardless of registration order', async () => {
    const starts: string[] = [];
    const scheduler = new MessageMediaScheduler({ maxConcurrent: 1 });
    let finishTop: (() => void) | undefined;
    let finishBottom: (() => void) | undefined;

    scheduler.enqueue({
      id: 'top',
      priority: 'visible',
      bottom: 200,
      run: () => new Promise<void>((resolve) => {
        starts.push('top');
        finishTop = resolve;
      }),
    });
    scheduler.enqueue({
      id: 'bottom',
      priority: 'visible',
      bottom: 800,
      run: () => new Promise<void>((resolve) => {
        starts.push('bottom');
        finishBottom = resolve;
      }),
    });

    await flushMicrotasks();
    expect(starts).toEqual(['bottom']);
    finishBottom?.();
    await flushMicrotasks();
    expect(starts).toEqual(['bottom', 'top']);
    finishTop?.();
  });

  it('runs visible work before prefetch work and respects concurrency', async () => {
    const starts: string[] = [];
    const completions = new Map<string, () => void>();
    const scheduler = new MessageMediaScheduler({ maxConcurrent: 2 });
    const task = (id: string, priority: 'visible' | 'prefetch', bottom: number) => ({
      id,
      priority,
      bottom,
      run: () => new Promise<void>((resolve) => {
        starts.push(id);
        completions.set(id, resolve);
      }),
    });

    scheduler.enqueue(task('prefetch', 'prefetch', 900));
    scheduler.enqueue(task('visible-low', 'visible', 300));
    scheduler.enqueue(task('visible-high', 'visible', 700));
    await flushMicrotasks();

    expect(starts).toEqual(['visible-high', 'visible-low']);
    completions.get('visible-high')?.();
    await flushMicrotasks();
    expect(starts).toEqual(['visible-high', 'visible-low', 'prefetch']);
  });

  it('cancels queued work without starting it', async () => {
    const run = vi.fn(async () => undefined);
    const scheduler = new MessageMediaScheduler({ maxConcurrent: 1 });
    const cancel = scheduler.enqueue({
      id: 'cancelled',
      priority: 'visible',
      bottom: 500,
      run,
    });
    cancel();
    await flushMicrotasks();
    expect(run).not.toHaveBeenCalled();
  });

  it('aborts active work so newly visible media can use the released slot', async () => {
    const starts: string[] = [];
    const scheduler = new MessageMediaScheduler({ maxConcurrent: 1 });
    const cancelFirst = scheduler.enqueue({
      id: 'no-longer-visible',
      priority: 'prefetch',
      bottom: 100,
      run: (signal) => new Promise<void>((_resolve, reject) => {
        starts.push('no-longer-visible');
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    });

    await flushMicrotasks();
    scheduler.enqueue({
      id: 'newly-visible',
      priority: 'visible',
      bottom: 900,
      run: async () => {
        starts.push('newly-visible');
      },
    });
    cancelFirst();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(starts).toEqual(['no-longer-visible', 'newly-visible']);
  });

  it('waits for an active task to settle before starting its same-id replacement', async () => {
    const starts: string[] = [];
    const scheduler = new MessageMediaScheduler({ maxConcurrent: 2 });
    let finishFirst: (() => void) | undefined;
    scheduler.enqueue({
      id: 'image-1',
      priority: 'prefetch',
      bottom: 100,
      run: () => new Promise<void>((resolve) => {
        starts.push('first');
        finishFirst = resolve;
      }),
    });
    await flushMicrotasks();

    scheduler.enqueue({
      id: 'image-1',
      priority: 'visible',
      bottom: 900,
      run: async () => {
        starts.push('replacement');
      },
    });
    await flushMicrotasks();
    expect(starts).toEqual(['first']);

    finishFirst?.();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(starts).toEqual(['first', 'replacement']);
  });
});
