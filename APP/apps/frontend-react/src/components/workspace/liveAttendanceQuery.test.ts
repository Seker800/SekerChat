import { describe, expect, it } from 'vitest';
import { LIVE_ATTENDANCE_QUERY_POLICY } from './liveAttendanceQuery';

describe('live attendance query policy', () => {
  it('refreshes current online projections once per minute in the background', () => {
    expect(LIVE_ATTENDANCE_QUERY_POLICY).toEqual({
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    });
  });
});
