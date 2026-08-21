import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DmAttendancePage } from './DmAttendancePage';

const fetchOwnAttendancePanel = vi.fn();
const fetchOwnCheckInPanel = vi.fn();

vi.mock('../../lib/attendance-api', () => ({
  fetchOwnAttendancePanel: (...args: unknown[]) => fetchOwnAttendancePanel(...args),
  fetchOwnCheckInPanel: (...args: unknown[]) => fetchOwnCheckInPanel(...args),
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

  it('移除趋势主图并让两张副图共用等分布局', async () => {
    renderPage();

    const secondaryCharts = await screen.findByTestId('attendance-secondary-charts');
    expect(screen.queryByRole('heading', { name: '打卡/在线时长趋势' })).not.toBeInTheDocument();
    expect(secondaryCharts).toContainElement(screen.getByRole('heading', { name: '在线强度热力矩阵' }));
    expect(secondaryCharts).toContainElement(screen.getByRole('heading', { name: '签到 / 签退时间分布' }));
    expect(secondaryCharts.children).toHaveLength(2);
  });

  it('在签到与签退之间绘制连接并把两个气泡标记放在时间轴上', async () => {
    renderPage();

    const connector = await screen.findByTestId('timeline-checkin-checkout-connection');
    expect(connector).toHaveStyle({ left: '37.5%' });
    expect(Number.parseFloat(connector.style.width)).toBeCloseTo(33.333, 2);
    expect(screen.getByTestId('timeline-checkin-marker')).toHaveTextContent('签到');
    expect(screen.getByTestId('timeline-checkout-marker')).toHaveTextContent('签退');
  });
});
