import { Injectable, Logger } from '@nestjs/common';

type QueueName = 'file-preview' | 'album-media';

/** Post-commit hints for the single active backend. A lost hint is recovered by polling. */
@Injectable()
export class WorkQueueSignals {
  private readonly logger = new Logger(WorkQueueSignals.name);
  private readonly listeners = new Map<QueueName, Set<() => void>>();
  private readonly pending = new Set<QueueName>();

  subscribe(queue: QueueName, listener: () => void): () => void {
    const listeners = this.listeners.get(queue) ?? new Set();
    listeners.add(listener);
    this.listeners.set(queue, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  notify(queue: QueueName): void {
    if (this.pending.has(queue)) return;
    this.pending.add(queue);
    queueMicrotask(() => {
      this.pending.delete(queue);
      for (const listener of this.listeners.get(queue) ?? []) {
        try {
          listener();
        } catch {
          this.logger.warn('work_queue_wakeup_failed');
        }
      }
    });
  }
}
