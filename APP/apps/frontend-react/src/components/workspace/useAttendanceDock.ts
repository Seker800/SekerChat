import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOwnCheckInController } from './useOwnCheckInController';

const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const CHECKOUT_REMINDER_MINUTES = 8 * 60;
const EVENING_REMINDER_MINUTES = 17 * 60 + 30;
const ATTENDANCE_PANEL_AUTO_OPEN_DELAY_MS = 650;
const ATTENDANCE_PANEL_EXIT_MS = 240;
const ATTENDANCE_ACTION_MIN_PROGRESS_MS = 1500;
const ATTENDANCE_ACTION_SUCCESS_MS = 520;

export type AttendanceActionKind = 'checkin' | 'checkout';

type AttendancePanelState = {
  promptKey: string | null;
  shouldPrompt: boolean;
};

export interface AttendanceReminderRequest {
  kind: 'checkin' | 'checkout';
  nonce: number;
}

function getShanghaiMinutesNow(now: Date): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return Number(parts.hour ?? '0') * 60 + Number(parts.minute ?? '0');
}

function getCheckInDurationMinutes(
  today: NonNullable<ReturnType<typeof useOwnCheckInController>['today']>,
  now: Date,
  lastUpdatedAtMs: number,
): number {
  if (today.status !== 'CHECKED_IN') {
    return today.checkInMinutes;
  }

  const elapsedMinutesSinceSync = Math.max(
    0,
    Math.floor((now.getTime() - lastUpdatedAtMs) / 60_000),
  );
  return today.checkInMinutes + elapsedMinutesSinceSync;
}

function resolveAttendancePanelState(
  controller: ReturnType<typeof useOwnCheckInController>,
  now: Date,
): AttendancePanelState {
  if (controller.todayQuery.isLoading && !controller.today) {
    return { promptKey: null, shouldPrompt: false };
  }

  if (controller.todayQuery.isError || !controller.today) {
    return { promptKey: null, shouldPrompt: false };
  }

  if (controller.today.status === 'NOT_CHECKED_IN') {
    return { promptKey: `checkin:${controller.today.workDate}`, shouldPrompt: true };
  }

  if (controller.today.status === 'CHECKED_OUT') {
    return { promptKey: null, shouldPrompt: false };
  }

  const durationMinutes = getCheckInDurationMinutes(
    controller.today,
    now,
    controller.todayQuery.dataUpdatedAt,
  );
  const afterEveningReminderTime = getShanghaiMinutesNow(now) >= EVENING_REMINDER_MINUTES;
  const shouldPrompt = durationMinutes >= CHECKOUT_REMINDER_MINUTES || afterEveningReminderTime;
  const promptReason =
    durationMinutes >= CHECKOUT_REMINDER_MINUTES
      ? '8h'
      : afterEveningReminderTime
        ? '1730'
        : 'none';

  return {
    promptKey: shouldPrompt ? `checkout:${controller.today.workDate}:${promptReason}` : null,
    shouldPrompt,
  };
}

function resolveAttendanceActionKind(
  controller: ReturnType<typeof useOwnCheckInController>,
  override: AttendanceActionKind | null,
): AttendanceActionKind {
  if (override) {
    return override;
  }

  return controller.today?.status === 'CHECKED_IN' ? 'checkout' : 'checkin';
}

interface UseAttendanceDockOptions {
  accessToken: string;
  reminderRequest?: AttendanceReminderRequest | null;
}

export function useAttendanceDock({ accessToken, reminderRequest }: UseAttendanceDockOptions) {
  const progressTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const attendanceActionStartedAtRef = useRef<number | null>(null);
  const [attendanceActionPhase, setAttendanceActionPhase] = useState<
    'idle' | 'running' | 'success'
  >('idle');
  const [attendanceActionProgress, setAttendanceActionProgress] = useState(0);
  const [isAttendancePanelOpen, setIsAttendancePanelOpen] = useState(false);
  const [isAttendancePanelMounted, setIsAttendancePanelMounted] = useState(false);
  const [attendancePanelVisualState, setAttendancePanelVisualState] = useState<'open' | 'closed'>(
    'closed',
  );
  const [attendancePanelKindOverride, setAttendancePanelKindOverride] =
    useState<AttendanceActionKind | null>(null);
  const [dismissedAttendancePromptKey, setDismissedAttendancePromptKey] = useState<string | null>(
    null,
  );
  const [pendingAttendancePromptKey, setPendingAttendancePromptKey] = useState<string | null>(null);
  const lastAttendanceReminderNonceRef = useRef(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const attendanceController = useOwnCheckInController(accessToken, {
    onError: () => {
      attendanceActionStartedAtRef.current = null;
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      setAttendanceActionPhase('idle');
      setAttendanceActionProgress(0);
    },
    onSuccess: () => {
      const startedAt = attendanceActionStartedAtRef.current ?? Date.now();
      const elapsedMs = Date.now() - startedAt;
      const remainingProgressMs = Math.max(0, ATTENDANCE_ACTION_MIN_PROGRESS_MS - elapsedMs);

      successTimerRef.current = window.setTimeout(() => {
        if (progressTimerRef.current !== null) {
          window.clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setAttendanceActionProgress(100);
        setAttendanceActionPhase('success');
        attendanceActionStartedAtRef.current = null;
        successTimerRef.current = window.setTimeout(() => {
          setIsAttendancePanelOpen(false);
          successTimerRef.current = null;
          resetTimerRef.current = window.setTimeout(() => {
            setAttendanceActionPhase('idle');
            setAttendanceActionProgress(0);
            setAttendancePanelKindOverride(null);
            resetTimerRef.current = null;
          }, ATTENDANCE_PANEL_EXIT_MS);
        }, ATTENDANCE_ACTION_SUCCESS_MS);
      }, remainingProgressMs);
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (attendanceActionPhase !== 'running') {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }

    setAttendanceActionProgress(0);
    attendanceActionStartedAtRef.current = Date.now();
    progressTimerRef.current = window.setInterval(() => {
      const startedAt = attendanceActionStartedAtRef.current ?? Date.now();
      const elapsedMs = Date.now() - startedAt;
      const ratio = Math.min(elapsedMs / ATTENDANCE_ACTION_MIN_PROGRESS_MS, 1);
      setAttendanceActionProgress(Math.min(94, Math.floor(ratio * 94)));
    }, 55);

    return () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [attendanceActionPhase]);

  useEffect(
    () => () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
      }
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const attendancePanelState = useMemo(
    () => resolveAttendancePanelState(attendanceController, new Date(nowMs)),
    [
      attendanceController.today,
      attendanceController.todayQuery.isLoading,
      attendanceController.todayQuery.isError,
      attendanceController.todayQuery.dataUpdatedAt,
      nowMs,
    ],
  );
  const attendanceActionKind = useMemo(
    () => resolveAttendanceActionKind(attendanceController, attendancePanelKindOverride),
    [attendanceController.today?.status, attendancePanelKindOverride],
  );

  useEffect(() => {
    if (!attendancePanelState.promptKey) {
      setPendingAttendancePromptKey(null);
      return;
    }
    if (dismissedAttendancePromptKey === attendancePanelState.promptKey) {
      setPendingAttendancePromptKey(null);
      return;
    }
    setAttendancePanelKindOverride(null);
    setPendingAttendancePromptKey(attendancePanelState.promptKey);
    const timer = window.setTimeout(() => {
      setIsAttendancePanelOpen(true);
      setPendingAttendancePromptKey(null);
    }, ATTENDANCE_PANEL_AUTO_OPEN_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [attendancePanelState.promptKey, dismissedAttendancePromptKey]);

  useEffect(() => {
    if (!reminderRequest) {
      return;
    }

    if (reminderRequest.nonce === lastAttendanceReminderNonceRef.current) {
      return;
    }

    lastAttendanceReminderNonceRef.current = reminderRequest.nonce;
    setDismissedAttendancePromptKey(null);
    setAttendancePanelKindOverride(reminderRequest.kind);
    setPendingAttendancePromptKey(`manual:${reminderRequest.kind}:${reminderRequest.nonce}`);
    const timer = window.setTimeout(() => {
      setIsAttendancePanelOpen(true);
      setPendingAttendancePromptKey(null);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [reminderRequest]);

  useEffect(() => {
    if (isAttendancePanelOpen) {
      setIsAttendancePanelMounted(true);
      setAttendancePanelVisualState('closed');
      const frame = window.requestAnimationFrame(() => {
        setAttendancePanelVisualState('open');
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    setAttendancePanelVisualState('closed');
    if (!isAttendancePanelMounted) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsAttendancePanelMounted(false);
    }, ATTENDANCE_PANEL_EXIT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isAttendancePanelMounted, isAttendancePanelOpen]);

  useEffect(() => {
    if (attendanceController.isMutating) {
      return;
    }
    if (attendanceActionPhase !== 'idle') {
      return;
    }
    if (attendancePanelState.promptKey === null) {
      setIsAttendancePanelOpen(false);
      setDismissedAttendancePromptKey(null);
      setPendingAttendancePromptKey(null);
    }
  }, [attendanceActionPhase, attendanceController.isMutating, attendancePanelState.promptKey]);

  const onCloseAttendancePanel = useCallback(() => {
    setIsAttendancePanelOpen(false);
    setPendingAttendancePromptKey(null);
    setAttendancePanelKindOverride(null);
    if (attendancePanelState.promptKey) {
      setDismissedAttendancePromptKey(attendancePanelState.promptKey);
    }
  }, [attendancePanelState.promptKey]);

  const onPerformAttendanceAction = useCallback(() => {
    if (attendanceActionPhase !== 'idle') return;
    setAttendanceActionPhase('running');
    setPendingAttendancePromptKey(null);
    attendanceController.performPrimaryAction();
  }, [attendanceActionPhase, attendanceController]);

  return {
    isAttendancePanelMounted,
    attendancePanelVisualState,
    attendanceActionPhase,
    attendanceActionProgress,
    attendanceActionKind,
    attendanceActionDisabled: attendanceController.actionDisabled,
    onCloseAttendancePanel,
    onPerformAttendanceAction,
  };
}
