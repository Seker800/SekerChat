import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchOwnMonthlyAttendanceReport,
  fetchOwnMonthlyAttendanceReports,
  type MonthlyAttendanceReport,
} from '../../lib/attendance-api';
import styles from './DmAttendanceMonthlyReport.module.css';

function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)} 小时 ${String(minutes % 60).padStart(2, '0')} 分`;
}

function timeLabel(value: string | null, timezone: string): string {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '—';
}

function ScoreCard({
  label,
  percent,
  detail,
  tone,
}: {
  label: string;
  percent: number | null;
  detail: string;
  tone: 'overall' | 'online' | 'checkin';
}) {
  const detailId = `monthly-${tone}-detail`;
  return (
    <article className={`${styles.scoreCard} ${styles[tone]}`}>
      <button
        type="button"
        className={styles.scoreTrigger}
        aria-label={`${label} ${percent === null ? '暂无数据' : `${percent}%`}，查看详情`}
        aria-describedby={detailId}
      >
        <span className={styles.cardLabel}>
          {label}
          <span className={styles.infoMark} aria-hidden="true">
            ⓘ
          </span>
        </span>
        <strong className={styles.score}>{percent === null ? '—' : `${percent}%`}</strong>
        <span className={styles.progressTrack} aria-hidden="true">
          <span style={{ width: `${Math.min(percent ?? 0, 100)}%` }} />
        </span>
      </button>
      <span className={styles.metricTooltip} id={detailId} role="tooltip">
        {detail}
      </span>
    </article>
  );
}

function DailyRecords({ report }: { report: MonthlyAttendanceReport }) {
  return (
    <details className={styles.records}>
      <summary className={styles.recordsSummary}>
        <span>查看每日记录</span>
        <span className={styles.sectionAside}>共 {report.days.length} 天</span>
      </summary>
      {report.days.length === 0 ? (
        <p className={styles.empty}>此月份没有可统计的日期。</p>
      ) : (
        <div className={styles.recordList}>
          <div className={styles.recordHead}>
            <span>日期</span>
            <span>签到 / 签退</span>
            <span>在线时长</span>
            <span>打卡时长</span>
          </div>
          {report.days.map((day) => (
            <div className={styles.recordRow} key={day.workDate}>
              <span className={styles.recordDate}>
                <strong>{day.workDate.slice(5)}</strong>
                <small>{day.isWorkday ? '工作日' : '休息日'}</small>
              </span>
              <span className={styles.recordTimes}>
                {timeLabel(day.checkInAt, report.timezone)} –{' '}
                {timeLabel(day.checkOutAt, report.timezone)}
              </span>
              <span className={styles.onlineValue}>{duration(day.onlineMinutes)}</span>
              <span className={styles.checkinValue}>{duration(day.checkInMinutes)}</span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

export function DmAttendanceMonthlyReport({ accessToken }: { accessToken: string }) {
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const listQuery = useQuery({
    queryKey: ['attendance', 'me', 'monthly-list'],
    queryFn: () => fetchOwnMonthlyAttendanceReports(accessToken),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
  const items = listQuery.data?.items ?? [];
  const month = chosenMonth ?? items[0]?.month ?? null;
  const reportQuery = useQuery({
    queryKey: ['attendance', 'me', 'monthly', month],
    queryFn: () => fetchOwnMonthlyAttendanceReport(accessToken, month!),
    enabled: month !== null,
    staleTime: Infinity,
  });
  const report = reportQuery.data;
  const archivedDate = report
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: report.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(report.generatedAt))
    : null;
  return (
    <div className={styles.page} data-testid="attendance-monthly-report">
      <div className={styles.toolbar}>
        <span>月报档案</span>
        {items.length > 0 && month ? (
          <select
            className={styles.monthSelect}
            aria-label="选择月报月份"
            value={month}
            onChange={(event) => setChosenMonth(event.target.value)}
          >
            {items.map((item) => (
              <option key={item.month} value={item.month}>
                {item.month.replace('-', ' 年 ')} 月
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {listQuery.isLoading ? (
        <div className={styles.empty}>正在载入月报档案...</div>
      ) : listQuery.isError ? (
        <div className={styles.empty} role="alert">
          <p>{listQuery.error instanceof Error ? listQuery.error.message : '月报列表加载失败。'}</p>
          <button type="button" onClick={() => void listQuery.refetch()}>
            重试
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>还没有已归档月报。首份报告会在完整月份结束后生成。</div>
      ) : (
        <>
          {reportQuery.isLoading ? (
            <div className={styles.empty}>正在打开月报...</div>
          ) : reportQuery.isError || !report ? (
            <div className={styles.empty} role="alert">
              <p>
                {reportQuery.error instanceof Error ? reportQuery.error.message : '月报加载失败。'}
              </p>
              <button type="button" onClick={() => void reportQuery.refetch()}>
                重试
              </button>
            </div>
          ) : (
            <article className={styles.reportSheet} aria-label={`${report.month} 个人出勤报告`}>
              <header className={styles.reportHeader}>
                <div>
                  <span className={styles.reportKicker}>SEKERCHAT · MONTHLY ATTENDANCE</span>
                  <h2>个人出勤报告</h2>
                  <p>{report.month.replace('-', ' 年 ')} 月</p>
                </div>
                <span className={styles.archiveStamp}>月结归档</span>
              </header>
              <div className={styles.reportMeta}>
                <span>统计至 {report.range.effectiveEndDate}</span>
                <span>应出勤 {report.summary.expectedWorkDays} 天</span>
                <span>生成于 {archivedDate}</span>
              </div>
              <div className={styles.sectionLabel}>01 / 月度结论</div>
              <div className={styles.scoreGrid}>
                <ScoreCard
                  label="综合完成度"
                  percent={report.summary.overallCompletionPercent}
                  detail={`在线与打卡完成度的平均值。目标为 ${report.summary.expectedWorkDays} 个工作日，每天 8 小时，单日最多计入 8 小时；首月不含账号创建前的日期。统计至 ${report.range.effectiveEndDate}，生成于 ${archivedDate}，归档后固定保存。`}
                  tone="overall"
                />
                <ScoreCard
                  label="在线完成度"
                  percent={report.summary.onlineCompletionPercent}
                  detail={`非免打扰在线 ${duration(report.summary.onlineTotalMinutes)}，目标 ${duration(report.summary.targetMinutes)}。总时长包含休息日，完成度只统计工作日。`}
                  tone="online"
                />
                <ScoreCard
                  label="打卡完成度"
                  percent={report.summary.checkInCompletionPercent}
                  detail={`打卡 ${duration(report.summary.checkInTotalMinutes)}，目标 ${duration(report.summary.targetMinutes)}。总时长包含休息日，完成度只统计工作日。`}
                  tone="checkin"
                />
              </div>
              <div className={styles.sectionLabel}>02 / 逐日记录</div>
              <DailyRecords report={report} />
              <footer className={styles.reportFooter}>
                本报告按月生成并归档 · 详细统计口径可悬停或点击指标查看
              </footer>
            </article>
          )}
        </>
      )}
    </div>
  );
}
