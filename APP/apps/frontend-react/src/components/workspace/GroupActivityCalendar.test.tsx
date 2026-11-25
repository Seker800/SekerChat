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

function renderCalendar(groupCreatedAt: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GroupActivityCalendar
        groupId="group-1"
        groupCreatedAt={groupCreatedAt}
        accessToken="token"
      />
    </QueryClientProvider>,
  );
}

describe('GroupActivityCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-25T04:00:00.000Z'));
    mockedFetchGroupMessageActivity.mockResolvedValue({
      days: [
        { date: '2026-11-01', count: 12 },
        { date: '2026-11-02', count: 0 },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows every month when there are three or fewer', async () => {
    const { container } = renderCalendar('2026-09-01T04:00:00.000Z');

    await waitFor(() => {
      expect(container.querySelectorAll('[data-month]')).toHaveLength(3);
    });
    expect(container.querySelector('[data-month="2026-11"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /更早的/ })).not.toBeInTheDocument();
  });

  it('caps the default at three months and reveals older months on demand', async () => {
    const { container } = renderCalendar('2026-05-01T04:00:00.000Z');

    await waitFor(() => {
      expect(container.querySelectorAll('[data-month]')).toHaveLength(3);
    });

    fireEvent.click(screen.getByRole('button', { name: '更早的 4 个月' }));

    expect(container.querySelectorAll('[data-month]')).toHaveLength(7);
    expect(screen.getByRole('button', { name: '收起更早的 4 个月' })).toBeInTheDocument();
  });

  it('refreshes the activity counts on the polling interval', async () => {
    renderCalendar('2026-09-01T04:00:00.000Z');

    await waitFor(() => {
      expect(mockedFetchGroupMessageActivity).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(60_000);

    await waitFor(() => {
      expect(mockedFetchGroupMessageActivity).toHaveBeenCalledTimes(2);
    });
  });

  it('renders one dot per day and applies the fixed intensity thresholds', async () => {
    const { container } = renderCalendar('2026-09-01T04:00:00.000Z');

    const dot = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('[data-date="2026-11-01"]');
      expect(element).not.toBeNull();
      return element;
    });

    expect(dot?.className).toContain('level2');
    expect(dot?.getAttribute('aria-label')).toContain('12');
  });
});
