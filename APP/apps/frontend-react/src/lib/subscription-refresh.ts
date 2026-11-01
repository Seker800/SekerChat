import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import {
  getSubscriptionPost,
  type SubscriptionPost,
  type SubscriptionPostSummary,
} from './subscriptions-api';

type PostPages = InfiniteData<{
  items: Array<SubscriptionPostSummary | SubscriptionPost>;
  nextCursor?: string | null;
}>;

/** View changes cannot reorder articles, so refresh one article and patch loaded pages. */
export class SubscriptionViewRefresh {
  private stopped = false;
  private readonly pending = new Set<string>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly client: QueryClient,
    private readonly token: string,
  ) {}

  refresh(postId: string): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.pending.add(postId);
    const inFlight = this.running.get(postId);
    if (inFlight) return inFlight;
    const result = this.drain(postId).finally(() => this.running.delete(postId));
    this.running.set(postId, result);
    return result;
  }

  dispose(): void {
    this.stopped = true;
    this.pending.clear();
  }

  private async drain(postId: string) {
    while (this.pending.delete(postId)) {
      const queries = this.client.getQueryCache().findAll({ queryKey: ['subscriptions'] });
      const observed = queries.some(
        (query) =>
          query.isActive() &&
          (query.queryKey[1] === 'detail'
            ? query.queryKey[2] === postId
            : (query.state.data as PostPages | undefined)?.pages?.some((page) =>
                page.items.some((post) => post.id === postId),
              )),
      );
      if (!observed || document.visibilityState !== 'visible') {
        await this.client.invalidateQueries({ queryKey: ['subscriptions'], refetchType: 'none' });
        return;
      }
      const key = ['subscriptions', 'detail', postId];
      // An already-running read may predate this event; follow it with one fresh read.
      if (this.client.getQueryState(key)?.fetchStatus === 'fetching') this.pending.add(postId);
      const post = await this.client.fetchQuery({
        queryKey: key,
        queryFn: () => getSubscriptionPost(this.token, postId),
        staleTime: 0,
      });
      if (this.stopped) return;
      this.client.setQueriesData<PostPages>(
        {
          queryKey: ['subscriptions'],
          predicate: (query) => query.queryKey[1] !== 'detail',
        },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.id === postId ? { ...item, viewCount: post.viewCount } : item,
                  ),
                })),
              }
            : data,
      );
    }
  }
}
