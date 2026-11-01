import { describe, expect, it } from 'vitest';
import { LIVE_ATTENDANCE_QUERY_POLICY as policy } from './liveAttendanceQuery';

describe('live attendance query policy', () => {
  it('checks small snapshots once per minute, backs off failures and pauses hidden windows', () => {
    expect(policy.refetchInterval({ state: { status: 'success' } })).toBe(60_000);
    expect(policy.refetchInterval({ state: { status: 'error' } })).toBe(300_000);
    expect(policy.refetchIntervalInBackground).toBe(false);
    expect(policy.refetchOnWindowFocus).toBe('always');
  });
});
