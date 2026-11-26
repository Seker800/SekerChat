import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGroupMessageActivity } from '../../lib/activity-api';
import { GroupActivityCalendar } from './GroupActivityCalendar';

vi.mock('../../lib/activity-api', () => ({
  fetchGroupMessageActivity: vi.fn(),
}));

const mockedFetchGroupMessageActivity = vi.mocked(fetchGroupMessageActivity);

function mockActivity(days: Array<{ date: string; count: number }>) {
  mockedFetchGroupMessageActivity.mockResolvedValue({ days });
}

function renderCalendar() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GroupActivityCalendar groupId="group-1" accessToken="token" />
    </QueryClientProvider>,
  );
}

describe('GroupActivityCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-25T04:00:00.000Z'));
    mockActivity([{ date: '2026-11-01', count: 12 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows every month when there are three or fewer', async () => {
    mockActivity([
      { date: '2026-09-01', count: 1 },
      { date: '2026-10-01', count: 1 },
      { date: '2026-11-01', count: 1 },
    ]);
    const { container } = renderCalendar();

    await waitFor(() => {
      expect(container.querySelectorAll('[data-month]')).toHaveLength(3);
    });
    expect(
      [...container.querySelectorAll('[data-month]')].map((element) =>
        element.getAttribute('data-month'),
      ),
    ).toEqual(['2026-9', '2026-10', '2026-11']);
    expect(screen.queryByRole('button', { name: /更早的/ })).not.toBeInTheDocument();
  });

  it('caps the default at three months and reveals older months on demand', async () => {
    mockActivity([
      { date: '2026-05-01', count: 1 },
      { date: '2026-11-01', count: 1 },
    ]);
    const { container } = renderCalendar();

    await waitFor(() => {
      expect(container.querySelectorAll('[data-month]')).toHaveLength(3);
    });
    expect(
      [...container.querySelectorAll('[data-month]')].map((element) =>
        element.getAttribute('data-month'),
      ),
    ).toEqual(['2026-9', '2026-10', '2026-11']);

    fireEvent.click(screen.getByRole('button', { name: '更早的 4 个月' }));

    const allMonths = [...container.querySelectorAll('[data-month]')];
    expect(allMonths).toHaveLength(7);
    expect(allMonths[0]?.getAttribute('data-month')).toBe('2026-5');
    expect(allMonths[allMonths.length - 1]?.getAttribute('data-month')).toBe('2026-11');
    expect(screen.getByRole('button', { name: '收起更早的 4 个月' })).toBeInTheDocument();
  });

  it('does not poll in the background; realtime invalidation refreshes it', async () => {
    renderCalendar();

    await waitFor(() => {
      expect(mockedFetchGroupMessageActivity).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(180_000);

    expect(mockedFetchGroupMessageActivity).toHaveBeenCalledTimes(1);
  });

  it('renders the full first and last message months', async () => {
    mockActivity([
      { date: '2026-11-24', count: 1 },
      { date: '2026-11-25', count: 2 },
    ]);
    const { container } = renderCalendar();

    await waitFor(() => {
      const grid = container.querySelector<HTMLElement>('[data-month="2026-11"] [data-grid]');
      expect(grid).not.toBeNull();
      expect(grid?.children).toHaveLength(36);
    });
    expect(container.querySelector('[data-date="2026-11-01"]')).not.toBeNull();
    expect(container.querySelector('[data-date="2026-11-30"]')).not.toBeNull();
  });

  it('marks weekend days with a weak slash while keeping the activity color', async () => {
    mockActivity([
      { date: '2026-11-01', count: 12 },
      { date: '2026-11-02', count: 3 },
    ]);
    const { container } = renderCalendar();

    const sunday = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('[data-date="2026-11-01"]');
      expect(element).not.toBeNull();
      return element;
    });
    const monday = container.querySelector<HTMLElement>('[data-date="2026-11-02"]');

    expect(sunday?.dataset.weekend).toBe('true');
    expect(sunday?.className).toContain('level2');
    expect(monday?.dataset.weekend).toBeUndefined();
  });

  it('renders one dot per day and applies the fixed intensity thresholds', async () => {
    const { container } = renderCalendar();

    const dot = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('[data-date="2026-11-01"]');
      expect(element).not.toBeNull();
      return element;
    });

    expect(dot?.className).toContain('level2');
    expect(dot?.getAttribute('aria-label')).toContain('12');
  });

  it('shows an empty state when the channel has no messages', async () => {
    mockActivity([]);
    const { container } = renderCalendar();

    await waitFor(() => {
      expect(screen.getByText('暂无消息')).toBeInTheDocument();
    });
    expect(container.querySelector('[data-month]')).toBeNull();
  });
});
