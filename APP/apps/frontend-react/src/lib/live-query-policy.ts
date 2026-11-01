/** Minute-scale checks carry small current-state snapshots, never history pages. */
export const LIVE_QUERY_POLICY = {
  staleTime: 30_000,
  refetchInterval: (query: { state: { status: string } }) =>
    query.state.status === 'error' ? 300_000 : 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: 'always',
} as const;
