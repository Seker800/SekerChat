import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchGroupMessageActivity } from '../../lib/activity-api';
import styles from './GroupActivityCalendar.module.css';

const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const DOUBLE_WEEKDAY_LABELS = [...WEEKDAY_LABELS, ...WEEKDAY_LABELS];
const VISIBLE_MONTH_LIMIT = 3;

interface MonthInfo {
  year: number;
  month: number;
}

interface GroupActivityCalendarProps {
  groupId: string;
  accessToken: string;
  isActive?: boolean;
}

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateKeyInShanghai(value: Date): string {
  const parts = dateKeyFormatter.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function listMonths(firstKey: string, lastKey: string): MonthInfo[] {
  const [firstYear, firstMonth] = firstKey.split('-').map(Number);
  const [lastYear, lastMonth] = lastKey.split('-').map(Number);
  const months: MonthInfo[] = [];
  let year = firstYear;
  let month = firstMonth - 1;

  while (year < lastYear || (year === lastYear && month <= lastMonth - 1)) {
    months.push({ year, month });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return months;
}

function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count >= 150) return 4;
  if (count >= 50) return 3;
  if (count >= 10) return 2;
  if (count > 0) return 1;
  return 0;
}

export function GroupActivityCalendar({
  groupId,
  accessToken,
  isActive = true,
}: GroupActivityCalendarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [olderOpen, setOlderOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    date: string;
    count: number;
    left: number;
    top: number;
  } | null>(null);

  const activityQuery = useQuery({
    queryKey: ['group-message-activity', groupId],
    queryFn: () => fetchGroupMessageActivity(accessToken, groupId),
    enabled: isActive,
    staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of activityQuery.data?.days ?? []) {
      map.set(day.date, day.count);
    }
    return map;
  }, [activityQuery.data]);

  const activeDays = useMemo(
    () =>
      [...(activityQuery.data?.days ?? [])]
        .filter((day) => day.count > 0)
        .sort((left, right) => left.date.localeCompare(right.date)),
    [activityQuery.data],
  );
  const firstMessageKey = activeDays[0]?.date ?? null;
  const lastMessageKey = activeDays[activeDays.length - 1]?.date ?? null;
  const todayKey = dateKeyInShanghai(new Date());
  const months = useMemo(
    () => (firstMessageKey && lastMessageKey ? listMonths(firstMessageKey, lastMessageKey) : []),
    [firstMessageKey, lastMessageKey],
  );
  const recentMonths = months.slice(-VISIBLE_MONTH_LIMIT);
  const olderMonths = months.slice(0, Math.max(0, months.length - VISIBLE_MONTH_LIMIT));
  const visible = olderOpen ? months : recentMonths;
  const olderCount = olderMonths.length;
  const errorMessage = activityQuery.error instanceof Error
    ? activityQuery.error.message
    : t('rightSidebar.activityLoadFailed');

  useEffect(() => {
    setOlderOpen(false);
    setTooltip(null);
  }, [groupId]);

  useEffect(() => {
    const hideTooltip = () => setTooltip(null);
    window.addEventListener('scroll', hideTooltip, true);
    return () => window.removeEventListener('scroll', hideTooltip, true);
  }, []);

  const showTooltip = (clientX: number, clientY: number, date: string, count: number) => {
    setTooltip({
      date,
      count,
      left: Math.max(8, Math.min(clientX + 14, window.innerWidth - 220)),
      top: Math.max(8, Math.min(clientY + 14, window.innerHeight - 56)),
    });
  };

  const renderMonth = (monthInfo: MonthInfo, previousMonth: MonthInfo | undefined) => {
    const daysInMonth = new Date(Date.UTC(monthInfo.year, monthInfo.month + 1, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(monthInfo.year, monthInfo.month, 1)).getUTCDay();
    const leading = (firstWeekday + 6) % 7;
    const showYear = !previousMonth
      || previousMonth.year !== monthInfo.year
      || monthInfo.month === 0;
    const cells: ReactNode[] = [];

    for (let i = 0; i < leading; i += 1) {
      cells.push(<span key={`leading-${i}`} className={styles.spacer} />);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dayKey(monthInfo.year, monthInfo.month, day);
      const weekday = new Date(Date.UTC(monthInfo.year, monthInfo.month, day)).getUTCDay();
      const isWeekend = weekday === 0 || weekday === 6;

      const count = counts.get(key) ?? 0;
      const level = heatLevel(count);
      cells.push(
        <button
          key={key}
          type="button"
          data-date={key}
          data-weekend={isWeekend ? 'true' : undefined}
          className={[
            styles.dot,
            styles[`level${level}`],
            key === todayKey && lastMessageKey && todayKey <= lastMessageKey ? styles.today : '',
          ].filter(Boolean).join(' ')}
          aria-label={t('rightSidebar.activityDayAria', { date: key, count })}
          onPointerEnter={(event) => showTooltip(event.clientX, event.clientY, key, count)}
          onPointerMove={(event) => showTooltip(event.clientX, event.clientY, key, count)}
          onPointerLeave={() => setTooltip(null)}
          onFocus={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            showTooltip(rect.left + rect.width / 2, rect.top, key, count);
          }}
          onBlur={() => setTooltip(null)}
        />,
      );
    }

    return (
      <div
        key={`${monthInfo.year}-${monthInfo.month}`}
        className={styles.month}
        data-month={`${monthInfo.year}-${monthInfo.month + 1}`}
      >
        <div className={styles.monthLabel}>
          {showYear ? `${monthInfo.year}年${monthInfo.month + 1}月` : `${monthInfo.month + 1}月`}
        </div>
        <div className={styles.grid} data-grid="">{cells}</div>
      </div>
    );
  };

  return (
    <section
      className={`${styles.section} ${collapsed ? styles.collapsed : ''}`}
      data-testid="group-activity"
    >
      <div className={styles.header}>
        <span className={styles.label}>{t('rightSidebar.activity')}</span>
        <button
          className={styles.chevron}
          type="button"
          aria-label={collapsed ? t('rightSidebar.activityShow') : t('rightSidebar.activityHide')}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={styles.chevronIcon}
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        {activityQuery.isError ? (
          <div className={styles.status}>
            <p className={styles.error}>{errorMessage}</p>
            <div className={styles.errorActions}>
              <button className={styles.actionButton} type="button" onClick={() => void activityQuery.refetch()}>
                {t('rightSidebar.activityRetry')}
              </button>
            </div>
          </div>
        ) : activityQuery.isLoading ? (
          <p className={styles.status}>{t('rightSidebar.activityLoading')}</p>
        ) : !firstMessageKey ? (
          <p className={styles.status}>{t('rightSidebar.activityEmpty')}</p>
        ) : (
          <>
            <div className={styles.weekdays} aria-hidden="true">
              {DOUBLE_WEEKDAY_LABELS.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
            <div className={styles.months}>
              {visible.map((monthInfo, index) => renderMonth(monthInfo, visible[index - 1]))}
            </div>
            {olderCount > 0 ? (
              <div className={styles.actions}>
                <button
                  className={styles.actionButton}
                  type="button"
                  onClick={() => setOlderOpen((value) => !value)}
                >
                  {olderOpen
                    ? t('rightSidebar.activityOlderCollapse', { count: olderCount })
                    : t('rightSidebar.activityOlder', { count: olderCount })}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {tooltip
        ? createPortal(
            <div
              className={styles.tooltip}
              style={{ left: tooltip.left, top: tooltip.top }}
              role="tooltip"
            >
              {t('rightSidebar.activityTooltip', { date: tooltip.date, count: tooltip.count })}
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
