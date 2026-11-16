import { describe, expect, it } from 'vitest';
import { LIVE_QUERY_POLICY } from './live-query-policy';

describe('live query policy', () => {
  it('checks small snapshots once per minute, backs off failures and pauses hidden windows', () => {
    expect(LIVE_QUERY_POLICY.refetchInterval({ state: { status: 'success' } })).toBe(60_000);
    expect(LIVE_QUERY_POLICY.refetchInterval({ state: { status: 'error' } })).toBe(300_000);
    expect(LIVE_QUERY_POLICY.refetchIntervalInBackground).toBe(false);
    expect(LIVE_QUERY_POLICY.refetchOnWindowFocus).toBe('always');
  });
});
