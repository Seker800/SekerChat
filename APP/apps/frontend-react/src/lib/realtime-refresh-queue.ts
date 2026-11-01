import type { InvalidateQueryFilters, QueryClient } from '@tanstack/react-query';

/** Preserve refresh intent across hidden windows and reads already in flight. */
export class RealtimeRefreshQueue {
  private readonly deferred = new Map<string, InvalidateQueryFilters>();
  private readonly trailing = new Map<string, Promise<void>>();
  private stopped = false;

  constructor(
    private readonly client: QueryClient,
    private readonly visible: () => boolean,
  ) {}

  invalidate(filters: InvalidateQueryFilters): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const key = JSON.stringify(filters.queryKey);
    if (!this.visible()) {
      this.deferred.set(key, filters);
      return this.client.invalidateQueries({ ...filters, refetchType: 'none' });
    }
    const reads = this.client
      .getQueryCache()
      .findAll(filters)
      .filter((query) => query.state.fetchStatus === 'fetching')
      .map((query) => query.promise);
    if (!reads.length) return this.client.invalidateQueries(filters);
    const existing = this.trailing.get(key);
    if (existing) return existing;
    const next = Promise.allSettled(reads).then(async () => {
      this.trailing.delete(key);
      await this.invalidate(filters);
    });
    this.trailing.set(key, next);
    return next;
  }

  flush(): void {
    if (!this.visible() || this.stopped) return;
    const pending = [...this.deferred.values()];
    this.deferred.clear();
    for (const filters of pending) void this.invalidate(filters);
  }

  dispose(): void {
    this.stopped = true;
    this.deferred.clear();
  }
}
