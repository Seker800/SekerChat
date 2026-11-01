import { useCallback, useEffect } from 'react';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkIn,
  checkOut,
  fetchOwnCheckInToday,
  type CheckInTodayResponse,
} from '../../lib/attendance-api';

import { LIVE_ATTENDANCE_QUERY_POLICY } from './liveAttendanceQuery';

type CheckInStatus = CheckInTodayResponse['status'];

function getPrimaryActionLabel(status: CheckInStatus): string {
  if (status === 'NOT_CHECKED_IN') return '上班签到';
  if (status === 'CHECKED_IN') return '下班签退';
  return '再次上班签到';
}

export function getCheckInStatusText(status: CheckInStatus): string {
  if (status === 'CHECKED_IN') return '已签到';
  if (status === 'CHECKED_OUT') return '已签退';
  return '未签到';
}

async function invalidateOwnAttendanceQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['attendance', 'me', 'checkin', 'today'] }),
    queryClient.invalidateQueries({ queryKey: ['attendance', 'me', 'checkin-panel'] }),
    queryClient.invalidateQueries({ queryKey: ['attendance', 'me', 'panel'] }),
  ]);
}

export function useOwnCheckInController(
  accessToken: string,
  options?: {
    onError?: (error: unknown) => void;
    onSuccess?: () => void;
  },
) {
  const queryClient = useQueryClient();
  const todayQuery = useQuery({
    queryKey: ['attendance', 'me', 'checkin', 'today'],
    queryFn: () => fetchOwnCheckInToday(accessToken),
    ...LIVE_ATTENDANCE_QUERY_POLICY,
  });

  // A day transition invalidates history once; minute ticks update only today's snapshot.
  useEffect(() => {
    const day = todayQuery.data?.workDate;
    if (!day) return;
    const dayKey = ['attendance', 'me', 'current-day'];
    const previous = queryClient.getQueryData<string>(dayKey);
    queryClient.setQueryData(dayKey, day);
    void queryClient.invalidateQueries({
      queryKey: ['attendance', 'me'],
      predicate: (query) => {
        if (query.state.isInvalidated) return false;
        const key = query.queryKey[2];
        if (key !== 'panel' && key !== 'checkin-panel' && key !== 'monthly-list') return false;
        const range = (query.state.data as { range?: { endDate: string } } | undefined)?.range;
        return Boolean(previous && previous !== day) || Boolean(range && range.endDate !== day);
      },
    });
  }, [queryClient, todayQuery.data?.workDate]);

  const handleMutationSuccess = useCallback(async () => {
    await invalidateOwnAttendanceQueries(queryClient);
    options?.onSuccess?.();
  }, [options, queryClient]);

  const handleMutationError = useCallback((error: unknown) => {
    options?.onError?.(error);
  }, [options]);

  const checkInMutation = useMutation({
    mutationFn: () => checkIn(accessToken),
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  });

  const checkOutMutation = useMutation({
    mutationFn: () => checkOut(accessToken),
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  });

  const isMutating = checkInMutation.isPending || checkOutMutation.isPending;
  const today = todayQuery.data;
  const status = today?.status;
  const actionLabel = status ? getPrimaryActionLabel(status) : todayQuery.isError ? '重试同步' : '同步中';
  const actionDisabled = isMutating || (!today && !todayQuery.isError);

  const performPrimaryAction = useCallback(() => {
    if (!today) {
      if (todayQuery.isError) {
        void todayQuery.refetch();
      }
      return;
    }

    if (today.status !== 'CHECKED_IN') {
      checkInMutation.mutate();
      return;
    }

    checkOutMutation.mutate();
  }, [checkInMutation, checkOutMutation, today, todayQuery]);

  return {
    today,
    todayQuery,
    isMutating,
    actionLabel,
    actionDisabled,
    performPrimaryAction,
    checkInMutation,
    checkOutMutation,
  };
}
