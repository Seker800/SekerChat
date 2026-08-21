import { useCallback } from 'react';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkIn,
  checkOut,
  fetchOwnCheckInToday,
  type CheckInTodayResponse,
} from '../../lib/attendance-api';

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
    staleTime: 30 * 1000,
  });

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
