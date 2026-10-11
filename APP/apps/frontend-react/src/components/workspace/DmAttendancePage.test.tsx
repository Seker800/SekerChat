import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DmAttendancePage } from './DmAttendancePage';

const fetchOwnAttendancePanel = vi.fn();
const fetchOwnCheckInPanel = vi.fn();
const fetchOwnMonthlyAttendanceReport = vi.fn();

vi.mock('../../lib/attendance-api', () => ({
  fetchOwnAttendancePanel: (...args: unknown[]) => fetchOwnAttendancePanel(...args),
  fetchOwnCheckInPanel: (...args: unknown[]) => fetchOwnCheckInPanel(...args),
  fetchOwnMonthlyAttendanceReport: (...args: unknown[]) => fetchOwnMonthlyAttendanceReport(...args),
}));

vi.mock('./useOwnCheckInController', () => ({
  getCheckInStatusText: (status: string) => status,
  useOwnCheckInController: () => ({
    actionLabel: '下班签退',
    actionDisabled: false,
    performPrimaryAction: vi.fn(),
  }),
}));

const today = {
  workDate: '2026-08-11',
  status: 'CHECKED_OUT',
  checkInAt: '2026-08-11T01:00:00.000Z',
  checkOutAt: '2026-08-11T09:00:00.000Z',
  checkInMinutes: 120,
  onlineMinutes: 90,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DmAttendancePage accessToken="token" />
    </QueryClientProvider>,
  );
}

describe('DmAttendancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchOwnMonthlyAttendanceReport.mockResolvedValue({
      month: '2026-08', currentMonth: '2026-08', firstAvailableMonth: '2025-10', isCurrentMonth: true,
      timezone: 'Asia/Shanghai', targetDailyMinutes: 480,
      range: { startDate: '2026-08-01', endDate: '2026-08-31', effectiveStartDate: '2026-08-01', effectiveEndDate: '2026-08-11' },
      summary: { expectedWorkDays: 7, targetMinutes: 3360, onlineTotalMinutes: 1680, checkInTotalMinutes: 2100, onlineCompletionPercent: 50, checkInCompletionPercent: 63, overallCompletionPercent: 56 },
      days: [{ ...today, isWorkday: true }],
    });
    fetchOwnAttendancePanel.mockResolvedValue({
      summary: {
        dayWorkedMinutes: 90,
      },
      dailySeries: [{ workDate: today.workDate, onlineMinutes: 90 }],
      todaySegments: [],
      range: { startDate: today.workDate, endDate: today.workDate, days: 30 },
    });
    fetchOwnCheckInPanel.mockResolvedValue({
      today,
      summary: {
        checkedInDays: 1,
        completedDays: 0,
        completionRate: 0,
        consecutiveCheckInDays: 1,
        onlineTodayMinutes: 90,
        averages: {
          online: { monthAverageMinutes: 90, totalAverageMinutes: 90 },
          checkIn: { monthAverageMinutes: 120, totalAverageMinutes: 120 },
        },
      },
      statusSeries: [{
        workDate: today.workDate,
        status: today.status,
        checkInAt: today.checkInAt,
        checkOutAt: today.checkOutAt,
      }],
      recentRecords: [],
      checkInSeries: [{ workDate: today.workDate, checkInMinutes: 120 }],
      onlineSeries: [{ workDate: today.workDate, onlineMinutes: 90 }],
      range: { startDate: today.workDate, endDate: today.workDate, days: 30 },
    });
  });

  it('按打卡和非免打扰在线时长的日均值显示全年活跃图', async () => {
    renderPage();

    const secondaryCharts = await screen.findByTestId('attendance-secondary-charts');
    expect(screen.queryByRole('heading', { name: '打卡/在线时长趋势' })).not.toBeInTheDocument();
    expect(secondaryCharts).toContainElement(screen.getByRole('heading', { name: '过去一年有 1 天活跃' }));
    expect(secondaryCharts).toContainElement(screen.getByRole('heading', { name: '签到 / 签退时间分布' }));
    expect(secondaryCharts.children).toHaveLength(2);
    expect(fetchOwnCheckInPanel).toHaveBeenCalledWith('token', 365);
    const day = screen.getByRole('button', { name: /2026-08-11，综合平均 1h 45m，打卡 2h 00m，非免打扰在线 1h 30m/ });
    fireEvent.pointerEnter(day, { clientX: 100, clientY: 100 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('综合平均：1h 45m');
    expect(screen.getByRole('tooltip')).toHaveTextContent('打卡：2h 00m');
    expect(screen.getByRole('tooltip')).toHaveTextContent('非免打扰在线：1h 30m');
  });

  it('在签到与签退之间绘制连接并把两个气泡标记放在时间轴上', async () => {
    renderPage();

    const connector = await screen.findByTestId('timeline-checkin-checkout-connection');
    expect(connector).toHaveStyle({ left: '37.5%' });
    expect(Number.parseFloat(connector.style.width)).toBeCloseTo(33.333, 2);
    expect(screen.getByTestId('timeline-checkin-marker')).toHaveTextContent('签到');
    expect(screen.getByTestId('timeline-checkout-marker')).toHaveTextContent('签退');
  });

  it('切换到个人月报，展示完成度和逐日记录', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: '我的月报' }));
    expect(await screen.findByText('综合完成度')).toBeInTheDocument();
    expect(screen.getByTestId('attendance-monthly-report')).toHaveTextContent('56%');
    expect(screen.getByTestId('attendance-monthly-report')).toHaveTextContent('08-11');
    expect(fetchOwnMonthlyAttendanceReport).toHaveBeenCalledWith('token', expect.any(String));
  });
});
