import { type ReactNode, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchOwnAttendancePanel,
  fetchOwnCheckInPanel,
  type AttendancePanelDay,
  type AttendancePanelResponse,
  type CheckInPanelDay,
  type CheckInPanelResponse,
} from '../../lib/attendance-api';
import { getCheckInStatusText, useOwnCheckInController } from './useOwnCheckInController';
import { LIVE_ATTENDANCE_QUERY_POLICY } from './liveAttendanceQuery';
import styles from './WorkspaceShell.module.css';

type RangeKey = 7 | 30 | 90;
const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const HEATMAP_WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function formatTimeLabel(value: string | null): string {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function getShanghaiTimeParts(value: string | null): { hours: number; minutes: number } | null {
  if (!value) return null;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    hours: Number(map.hour ?? '0'),
    minutes: Number(map.minute ?? '0'),
  };
}

function parseDateKey(workDate: string): Date {
  const [year, month, day] = workDate.split('-').map((value) => Number.parseInt(value, 10));
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatDateKey(workDate: Date): string {
  const year = workDate.getUTCFullYear();
  const month = String(workDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(workDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDateKey(workDate: string, days: number): string {
  const date = parseDateKey(workDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
}

function getWeekdayIndex(workDate: string): number {
  const day = parseDateKey(workDate).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function getWeekStartDate(workDate: string): string {
  return shiftDateKey(workDate, -getWeekdayIndex(workDate));
}

function formatShortDate(workDate: string): string {
  return workDate.slice(5).replace('-', '/');
}

function CheckInTimeDistribution({
  range,
  onRangeChange,
  data,
}: {
  range: RangeKey;
  onRangeChange: (next: RangeKey) => void;
  data: CheckInPanelResponse['statusSeries'];
}) {
  const width = 760;
  const rowHeight = 18;
  const chartHeight = Math.max(116, data.length * rowHeight);
  const leftPad = 58;
  const plotWidth = width - leftPad - 12;

  return (
    <section className={styles.panelCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <div className={styles.panelEyebrow}>副图</div>
          <h3>签到 / 签退时间分布</h3>
        </div>
        <div className={styles.trendHeaderAside}>
          <div className={styles.rangeTabs}>
            {[7, 30, 90].map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.rangeTab} ${range === value ? styles.rangeTabActive : ''}`}
                onClick={() => onRangeChange(value as RangeKey)}
              >
                {value === 7 ? '1周' : value === 30 ? '1月' : '3月'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className={`${styles.chartShell} ${styles.timeDistributionViewport}`}
        data-testid="time-distribution-viewport"
      >
        <svg viewBox={`0 0 ${width} ${chartHeight + 28}`} className={styles.chartSvg} role="img" aria-label="签到签退时间分布图">
          {[0, 6, 12, 18, 24].map((hour) => {
            const x = leftPad + (hour / 24) * plotWidth;
            return (
              <g key={hour}>
                <line x1={x} x2={x} y1="0" y2={chartHeight} className={styles.chartGrid} />
                <text x={x} y={chartHeight + 18} textAnchor="middle" className={styles.chartLabel}>
                  {String(hour).padStart(2, '0')}
                </text>
              </g>
            );
          })}
          {data.map((item, index) => {
            const y = index * rowHeight + 12;
            const checkIn = getShanghaiTimeParts(item.checkInAt);
            const checkOut = getShanghaiTimeParts(item.checkOutAt);
            const checkInX = checkIn ? leftPad + (((checkIn.hours * 60 + checkIn.minutes) / 1440) * plotWidth) : null;
            const checkOutX = checkOut ? leftPad + (((checkOut.hours * 60 + checkOut.minutes) / 1440) * plotWidth) : null;
            return (
              <g key={item.workDate}>
                <text x="0" y={y + 4} className={styles.chartLabel}>{item.workDate.slice(5)}</text>
                <line x1={leftPad} x2={width - 12} y1={y} y2={y} className={styles.subtleGuide} />
                {checkInX !== null && checkOutX !== null ? (
                  <line x1={checkInX} x2={checkOutX} y1={y} y2={y} className={styles.checkInSpanLine} />
                ) : null}
                {checkInX ? <circle cx={checkInX} cy={y} r="3.5" className={styles.checkInDot} /> : null}
                {checkOutX ? <rect x={checkOutX - 3.5} y={y - 3.5} width="7" height="7" rx="2" className={styles.checkOutDot} /> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.distributionLegend}>
        <span><i className={styles.checkInDotLegend} />签到</span>
        <span><i className={styles.checkOutDotLegend} />签退</span>
      </div>
    </section>
  );
}

function AttendanceHeatMatrix({
  range,
  onRangeChange,
  statusSeries,
  onlineSeries,
  checkInSeries,
}: {
  range: RangeKey;
  onRangeChange: (next: RangeKey) => void;
  statusSeries: CheckInPanelResponse['statusSeries'];
  onlineSeries: AttendancePanelDay[];
  checkInSeries: CheckInPanelDay[];
}) {
  const onlineMap = useMemo(
    () => new Map(onlineSeries.map((item) => [item.workDate, item.onlineMinutes])),
    [onlineSeries],
  );
  const checkInMap = useMemo(
    () => new Map(checkInSeries.map((item) => [item.workDate, item.checkInMinutes])),
    [checkInSeries],
  );

  type HeatCell = {
    workDate: string;
    onlineMinutes: number;
    checkInMinutes: number;
    status: CheckInPanelResponse['statusSeries'][number]['status'];
  };

  const weekRows = useMemo(() => {
    const grouped = new Map<string, HeatCell[]>();

    for (const item of statusSeries) {
      const weekStartDate = getWeekStartDate(item.workDate);
      const bucket = grouped.get(weekStartDate) ?? [];
      bucket.push({
        workDate: item.workDate,
        onlineMinutes: onlineMap.get(item.workDate) ?? 0,
        checkInMinutes: checkInMap.get(item.workDate) ?? 0,
        status: item.status,
      });
      grouped.set(weekStartDate, bucket);
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([weekStartDate, items]) => {
        const cells = Array.from({ length: 7 }, () => null as null | HeatCell);
        for (const item of items) {
          cells[getWeekdayIndex(item.workDate)] = item;
        }
        const monthLabel = weekStartDate.slice(0, 7);
        return { weekStartDate, monthLabel, cells };
      });
  }, [checkInMap, onlineMap, statusSeries]);

  const getHeatLevel = (minutes: number): 0 | 1 | 2 | 3 | 4 => {
    if (minutes <= 0) return 0;
    if (minutes >= 480) return 4;
    if (minutes >= 360) return 3;
    if (minutes >= 240) return 2;
    return 1;
  };

  const getHeatClass = (minutes: number): string => styles[`heatCellLevel${getHeatLevel(minutes)}`];
  const getHeatToneClass = (minutes: number): string => styles[`heatToneLevel${getHeatLevel(minutes)}`];

  const showMonthSeps =
    weekRows.length > 1 &&
    weekRows[0].monthLabel !== weekRows[weekRows.length - 1].monthLabel;

  const monthDisplay = (label: string): string => `${Number(label.slice(5))}月`;

  return (
    <section className={styles.panelCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <div className={styles.panelEyebrow}>副图</div>
          <h3>在线强度热力矩阵</h3>
        </div>
        <div className={styles.trendHeaderAside}>
          <div className={styles.rangeTabs}>
            {[7, 30, 90].map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.rangeTab} ${range === value ? styles.rangeTabActive : ''}`}
                onClick={() => onRangeChange(value as RangeKey)}
              >
                {value === 7 ? '1周' : value === 30 ? '1月' : '3月'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.heatmapShell}>
        <div
          className={styles.heatmapGrid}
          style={{ gridTemplateColumns: `48px repeat(7, minmax(34px, 1fr))` }}
          role="img"
          aria-label="出勤在线强度热力矩阵"
        >
          {/* header row: corner + weekday labels */}
          <div className={styles.heatmapCorner} />
          {HEATMAP_WEEKDAY_LABELS.map((label) => (
            <div key={label} className={styles.heatmapColHead}>
              {label}
            </div>
          ))}

          {/* body: flat list — month separators (span full row) + week rows (8 items each) */}
          {weekRows.flatMap((row, ri) => {
            const prevMonth = ri > 0 ? weekRows[ri - 1].monthLabel : '';
            const items: ReactNode[] = [];

            if (showMonthSeps && row.monthLabel !== prevMonth) {
              items.push(
                <div key={`msep-${row.monthLabel}`} className={styles.heatmapMonthSep}>
                  {monthDisplay(row.monthLabel)}
                </div>,
              );
            }

            items.push(
              <div key={`wl-${row.weekStartDate}`} className={styles.heatmapWeekLabel}>
                {formatShortDate(row.weekStartDate)}
              </div>,
            );

            for (let ci = 0; ci < 7; ci++) {
              const cell = row.cells[ci];
              if (!cell) {
                items.push(
                  <div
                    key={`${row.weekStartDate}-e${ci}`}
                    className={styles.heatmapCellEmpty}
                    aria-hidden="true"
                  />,
                );
              } else {
                const checkInToneClass = getHeatToneClass(cell.checkInMinutes);
                const isIdleDay = cell.onlineMinutes <= 0 && cell.checkInMinutes <= 0;
                items.push(
                  <div
                    key={cell.workDate}
                    className={`${styles.heatmapCell} ${getHeatClass(cell.onlineMinutes)} ${isIdleDay ? styles.heatmapCellIdle : ''} ${checkInToneClass}`}
                    title={`${cell.workDate} · 在线 ${formatDuration(cell.onlineMinutes)} · 打卡 ${formatDuration(cell.checkInMinutes)} · ${getCheckInStatusText(cell.status)}`}
                  >
                    <span className={styles.heatmapDateValue}>{cell.workDate.slice(-2)}</span>
                  </div>,
                );
              }
            }

            return items;
          })}
        </div>
      </div>
      <div className={styles.heatmapLegend}>
        <span><i className={`${styles.legendSwatch} ${styles.heatCellLevel1}`} />主色：在线 &lt;4h</span>
        <span><i className={`${styles.legendSwatch} ${styles.heatCellLevel2}`} />主色：在线 4-6h</span>
        <span><i className={`${styles.legendSwatch} ${styles.heatCellLevel3}`} />主色：在线 6-8h</span>
        <span><i className={`${styles.legendSwatch} ${styles.heatCellLevel4}`} />主色：在线 8h+</span>
        <span><i className={`${styles.legendSwatch} ${styles.heatToneLevel4}`} />边框：打卡时长同档分色</span>
      </div>
    </section>
  );
}

function TodayOnlineTimeline({
  segments,
  checkInAt,
  checkOutAt,
}: {
  segments: AttendancePanelResponse['todaySegments'];
  checkInAt: string | null;
  checkOutAt: string | null;
}) {
  const totalMinutes = 24 * 60;
  const checkIn = getShanghaiTimeParts(checkInAt);
  const checkOut = getShanghaiTimeParts(checkOutAt);
  const checkInLeft = checkIn ? ((checkIn.hours * 60 + checkIn.minutes) / totalMinutes) * 100 : null;
  const checkOutLeft = checkOut ? ((checkOut.hours * 60 + checkOut.minutes) / totalMinutes) * 100 : null;
  const clockedRange = checkInLeft !== null && checkOutLeft !== null
    ? {
        left: Math.min(checkInLeft, checkOutLeft),
        width: Math.abs(checkOutLeft - checkInLeft),
      }
    : null;

  return (
    <section className={styles.panelCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <div className={styles.panelEyebrow}>时段</div>
          <h3>今日在线时间轴</h3>
        </div>
      </div>
      <div className={styles.timelineShell}>
        <div className={styles.timelineTrack} data-testid="today-online-timeline-track">
          <div className={styles.timelineTrackSurface}>
            {segments.map((segment) => {
              const start = getShanghaiTimeParts(segment.startAt);
              const end = getShanghaiTimeParts(segment.endAt);
              if (!start || !end) {
                return null;
              }

              const startMinutes = start.hours * 60 + start.minutes;
              const endMinutes = end.hours * 60 + end.minutes;
              const width = Math.max(0, ((endMinutes - startMinutes) / totalMinutes) * 100);
              const left = (startMinutes / totalMinutes) * 100;
              const tone = !segment.isOnline
                ? styles.timelineOffline
                : segment.isDnd
                  ? styles.timelineDnd
                  : styles.timelineOnline;

              return (
                <div
                  key={`${segment.startAt}-${segment.endAt}`}
                  className={`${styles.timelineSegment} ${tone}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${formatTimeLabel(segment.startAt)} - ${formatTimeLabel(segment.endAt)} · ${segment.isOnline ? (segment.isDnd ? '免打扰在线' : '计入在线') : '离线'}`}
                />
              );
            })}
          </div>
          {clockedRange ? (
            <div
              className={styles.timelineClockedRange}
              data-testid="timeline-checkin-checkout-connection"
              style={{ left: `${clockedRange.left}%`, width: `${clockedRange.width}%` }}
              aria-hidden="true"
            />
          ) : null}
          {checkInLeft !== null ? (
            <div
              className={styles.timelineMarker}
              data-testid="timeline-checkin-marker"
              style={{ left: `${checkInLeft}%` }}
              title={`签到 · ${formatTimeLabel(checkInAt)}`}
            >
              <span className={styles.timelineMarkerLabel}>签到</span>
            </div>
          ) : null}
          {checkOutLeft !== null ? (
            <div
              className={`${styles.timelineMarker} ${styles.timelineMarkerCheckout}`}
              data-testid="timeline-checkout-marker"
              style={{ left: `${checkOutLeft}%` }}
              title={`签退 · ${formatTimeLabel(checkOutAt)}`}
            >
              <span className={styles.timelineMarkerLabel}>签退</span>
            </div>
          ) : null}
        </div>
        <div className={styles.timelineTicks}>
          {['00', '04', '08', '12', '16', '20', '24'].map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className={styles.timelineLegend}>
          <span><i className={`${styles.legendSwatch} ${styles.timelineOnline}`} />计入在线</span>
          <span><i className={`${styles.legendSwatch} ${styles.timelineDnd}`} />免打扰在线</span>
          <span><i className={`${styles.legendSwatch} ${styles.timelineOffline}`} />离线</span>
          <span><i className={styles.checkInDotLegend} />签到</span>
          <span><i className={styles.checkOutDotLegend} />签退</span>
        </div>
      </div>
    </section>
  );
}

export function DmAttendancePage({ accessToken }: { accessToken: string }) {
  const [range, setRange] = useState<RangeKey>(30);
  const checkInController = useOwnCheckInController(accessToken);
  const onlinePanelQuery = useQuery({
    queryKey: ['attendance', 'me', 'panel', range],
    queryFn: () => fetchOwnAttendancePanel(accessToken, range),
    ...LIVE_ATTENDANCE_QUERY_POLICY,
  });
  const checkInPanelQuery = useQuery({
    queryKey: ['attendance', 'me', 'checkin-panel', range],
    queryFn: () => fetchOwnCheckInPanel(accessToken, range),
    ...LIVE_ATTENDANCE_QUERY_POLICY,
  });

  const onlinePanel = onlinePanelQuery.data;
  const checkInPanel = checkInPanelQuery.data;
  const today = checkInPanel?.today;

  const actionLabel = checkInController.actionLabel;
  const actionDisabled = !today || checkInController.actionDisabled;

  const todayCheckInMinutes = checkInPanel?.checkInSeries[checkInPanel.checkInSeries.length - 1]?.checkInMinutes ?? 0;

  const recentRows = useMemo(() => {
    if (!checkInPanel || !onlinePanel) return [];
    const onlineMap = new Map(onlinePanel.dailySeries.map((item) => [item.workDate, item.onlineMinutes]));
    return checkInPanel.recentRecords.map((item) => ({
      ...item,
      onlineMinutes: onlineMap.get(item.workDate) ?? 0,
      checkInMinutes: checkInPanel.checkInSeries.find((seriesItem) => seriesItem.workDate === item.workDate)?.checkInMinutes ?? 0,
    }));
  }, [checkInPanel, onlinePanel]);

  return (
    <section className={styles.terminalBoard} data-testid="dm-attendance-page">
      {onlinePanelQuery.isLoading || checkInPanelQuery.isLoading ? (
        <div className={styles.specialPageEmpty}>正在载入出勤面板...</div>
      ) : onlinePanelQuery.isError || checkInPanelQuery.isError || !onlinePanel || !checkInPanel || !today ? (
        <div className={styles.specialPageEmpty}>
          {onlinePanelQuery.error instanceof Error
            ? onlinePanelQuery.error.message
            : checkInPanelQuery.error instanceof Error
              ? checkInPanelQuery.error.message
              : '出勤面板加载失败。'}
        </div>
      ) : (
        <div className={styles.boardMain}>
          <section className={styles.checkInHeroCard}>
            <div className={styles.checkInHeroToolbar}>
              <div className={styles.checkInHeroToolbarMain}>
                <div className={styles.panelEyebrow}>今日</div>
                <div className={styles.checkInHeroStatusInline}>
                  <span className={styles.checkInHeroStatusDot} aria-hidden="true" />
                  <strong className={styles.checkInHeroStatus}>{getCheckInStatusText(today.status)}</strong>
                </div>
              </div>
              <button
                type="button"
                className={styles.checkInActionButton}
                disabled={actionDisabled}
                onClick={checkInController.performPrimaryAction}
              >
                {actionLabel}
              </button>
            </div>
            <div className={styles.heroSummaryMatrix}>
              <div className={styles.heroSummaryCorner} />
              <div className={styles.heroSummaryHead}>今日时长</div>
              <div className={styles.heroSummaryHead}>月平均</div>
              <div className={styles.heroSummaryHead}>总平均</div>

              <div className={`${styles.heroSummaryLabel} ${styles.heroSummaryLabelOnline}`}>在线</div>
              <article className={styles.heroSummaryCell}>
                <strong className={styles.heroSummaryValueOnline}>{formatDuration(onlinePanel.summary.dayWorkedMinutes ?? 0)}</strong>
              </article>
              <article className={styles.heroSummaryCell}>
                <strong className={styles.heroSummaryValueOnline}>{formatDuration(checkInPanel.summary.averages.online.monthAverageMinutes)}</strong>
              </article>
              <article className={styles.heroSummaryCell}>
                <strong className={styles.heroSummaryValueOnline}>{formatDuration(checkInPanel.summary.averages.online.totalAverageMinutes)}</strong>
              </article>

              <div className={`${styles.heroSummaryLabel} ${styles.heroSummaryLabelCheckIn}`}>打卡</div>
              <article className={styles.heroSummaryCell}>
                <strong className={styles.heroSummaryValueCheckIn}>{formatDuration(todayCheckInMinutes)}</strong>
              </article>
              <article className={styles.heroSummaryCell}>
                <strong className={styles.heroSummaryValueCheckIn}>{formatDuration(checkInPanel.summary.averages.checkIn.monthAverageMinutes)}</strong>
              </article>
              <article className={styles.heroSummaryCell}>
                <strong className={styles.heroSummaryValueCheckIn}>{formatDuration(checkInPanel.summary.averages.checkIn.totalAverageMinutes)}</strong>
              </article>
            </div>
          </section>

            <TodayOnlineTimeline
              segments={onlinePanel.todaySegments}
              checkInAt={today.checkInAt}
              checkOutAt={today.checkOutAt}
            />

            <div
              className={styles.attendanceSecondaryCharts}
              data-testid="attendance-secondary-charts"
            >
              <AttendanceHeatMatrix
                range={range}
                onRangeChange={setRange}
                statusSeries={checkInPanel.statusSeries}
                onlineSeries={onlinePanel.dailySeries}
                checkInSeries={checkInPanel.checkInSeries}
              />

              <CheckInTimeDistribution
                range={range}
                onRangeChange={setRange}
                data={checkInPanel.statusSeries}
              />
            </div>

            <section className={styles.panelCard}>
              <div className={styles.panelCardHeader}>
                <div>
                  <div className={styles.panelEyebrow}>记录</div>
                  <h3>最近 7 天出勤记录</h3>
                </div>
              </div>
              <div className={styles.matrixTable}>
                <div className={styles.matrixHead}>
                  <span>日期</span>
                  <span>状态</span>
                  <span>签到</span>
                  <span>签退</span>
                  <span className={styles.matrixCheckInTone}>打卡时长</span>
                  <span className={styles.matrixOnlineTone}>在线时长</span>
                </div>
                {recentRows.map((item) => (
                  <div key={item.workDate} className={styles.matrixRow}>
                    <span>{item.workDate}</span>
                    <strong>{getCheckInStatusText(item.status)}</strong>
                    <span>{formatTimeLabel(item.checkInAt)}</span>
                    <span>{formatTimeLabel(item.checkOutAt)}</span>
                    <span className={styles.matrixCheckInTone}>{formatDuration(item.checkInMinutes)}</span>
                    <span className={styles.matrixOnlineTone}>{formatDuration(item.onlineMinutes)}</span>
                  </div>
                ))}
              </div>
            </section>
        </div>
      )}
    </section>
  );
}
