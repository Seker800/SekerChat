import { useQuery } from '@tanstack/react-query';
import { getAlbumUpdateStatus } from '../lib/album-api';
import { LIVE_QUERY_POLICY } from '../lib/live-query-policy';

export function useAlbumUpdateStatus(accessToken: string, enabled: boolean) {
  return useQuery({
    queryKey: ['album', 'update-status'],
    queryFn: () => getAlbumUpdateStatus(accessToken),
    enabled,
    ...LIVE_QUERY_POLICY,
  });
}
