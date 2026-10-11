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
  actual,
  target,
  tone,
}: {
  label: string;
  percent: number | null;
  actual?: number;
  target?: number;
  tone: 'overall' | 'online' | 'checkin';
}) {
  return (
    <article className={`${styles.scoreCard} ${styles[tone]}`}>
      <span className={styles.cardLabel}>{label}</span>
      <strong className={styles.score}>{percent === null ? '—' : `${percent}%`}</strong>
      {actual !== undefined && target !== undefined ? (
        <span className={styles.cardDetail}>
          {duration(actual)} <span>/ 目标 {duration(target)}</span>
        </span>
      ) : (
        <span className={styles.cardDetail}>在线与打卡完成度的平均值</span>
      )}
      <div className={styles.progressTrack} aria-hidden="true">
        <div style={{ width: `${percent ?? 0}%` }} />
      </div>
    </article>
  );
}

function DailyRecords({ report }: { report: MonthlyAttendanceReport }) {
  return (
    <section className={styles.records}>
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>每日记录</span>
          <h3>这个月的每一天</h3>
        </div>
        <span className={styles.sectionAside}>共 {report.days.length} 天</span>
      </div>
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
    </section>
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
  return (
    <div className={styles.page} data-testid="attendance-monthly-report">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>个人出勤 · 月度档案</span>
          <h2>我的月报</h2>
          <p>每月结束后生成并保存。默认展示最近一个完整月份。</p>
        </div>
      </header>
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
            <>
              <div className={styles.reportTitle}>
                <div>
                  <span className={styles.eyebrow}>月度总结</span>
                  <h3>{report.month.replace('-', ' 年 ')} 月</h3>
                </div>
                <span>
                  生成于{' '}
                  {new Intl.DateTimeFormat('zh-CN', {
                    timeZone: report.timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  }).format(new Date(report.generatedAt))}
                </span>
              </div>
              <div className={styles.periodLine}>
                <span className={styles.periodBadge}>已归档</span>
                <span>
                  统计至 {report.range.effectiveEndDate} · 应出勤 {report.summary.expectedWorkDays}{' '}
                  个工作日
                </span>
              </div>
              <div className={styles.scoreGrid}>
                <ScoreCard
                  label="综合完成度"
                  percent={report.summary.overallCompletionPercent}
                  tone="overall"
                />
                <ScoreCard
                  label="在线完成度"
                  percent={report.summary.onlineCompletionPercent}
                  actual={report.summary.onlineTotalMinutes}
                  target={report.summary.targetMinutes}
                  tone="online"
                />
                <ScoreCard
                  label="打卡完成度"
                  percent={report.summary.checkInCompletionPercent}
                  actual={report.summary.checkInTotalMinutes}
                  target={report.summary.targetMinutes}
                  tone="checkin"
                />
              </div>
              <p className={styles.explanation}>
                参考目标：每个工作日 8 小时。完成度只统计工作日，单日最多计入 8
                小时；总时长包含休息日。在线时长不含免打扰状态。首月不含账号创建前的日期。报告生成后不会随原始记录变化。
              </p>
            </>
          )}
          <section className={styles.history} aria-label="过往月报">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.eyebrow}>历史月报</span>
                <h3>已保存的月份</h3>
              </div>
              <span className={styles.sectionAside}>共 {items.length} 份</span>
            </div>
            <div className={styles.historyGrid}>
              {items.map((item) => (
                <button
                  type="button"
                  key={item.month}
                  className={`${styles.historyCard} ${month === item.month ? styles.historyActive : ''}`}
                  aria-pressed={month === item.month}
                  onClick={() => setChosenMonth(item.month)}
                >
                  <span>{item.month.replace('-', ' 年 ')} 月</span>
                  <strong>
                    {item.summary.overallCompletionPercent === null
                      ? '—'
                      : `${item.summary.overallCompletionPercent}%`}
                  </strong>
                  <small>综合完成度 · {item.summary.expectedWorkDays} 个工作日</small>
                </button>
              ))}
            </div>
          </section>
          {report && !reportQuery.isError ? <DailyRecords report={report} /> : null}
        </>
      )}
    </div>
  );
}
