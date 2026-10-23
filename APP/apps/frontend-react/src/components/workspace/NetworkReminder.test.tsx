import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchApi } from '../../lib/api-core';
import { NetworkReminder, NetworkReminderProvider, useNetworkReminder } from './NetworkReminder';

vi.mock('../../lib/api-core', () => ({ apiBaseUrl: '/api', fetchApi: vi.fn() }));

function ReminderSurface({ page = 'groups' }: { page?: string }) {
  const { visible } = useNetworkReminder();
  return (
    <>
      <span>{page}</span>
      {visible && <NetworkReminder />}
    </>
  );
}

describe('network reminder lifecycle', () => {
  beforeEach(() => {
    vi.mocked(fetchApi).mockReset();
  });

  it('acknowledges once across navigation, then checks again on a fresh login', async () => {
    vi.mocked(fetchApi).mockImplementation(async () => Response.json({ showWarning: true }));
    const view = render(
      <NetworkReminderProvider>
        <ReminderSurface />
      </NetworkReminderProvider>,
    );
    await screen.findByRole('status', { name: '网络提醒' });
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.rerender(
      <NetworkReminderProvider>
        <ReminderSurface page="admin" />
      </NetworkReminderProvider>,
    );
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.unmount();
    render(
      <NetworkReminderProvider>
        <ReminderSurface />
      </NetworkReminderProvider>,
    );
    await screen.findByRole('status', { name: '网络提醒' });
    expect(fetchApi).toHaveBeenCalledTimes(2);
  });

  it.each([false, undefined, 'true'])('ignores non-positive detection: %s', async (showWarning) => {
    vi.mocked(fetchApi).mockResolvedValue(Response.json({ showWarning }));
    render(
      <NetworkReminderProvider>
        <ReminderSurface />
      </NetworkReminderProvider>,
    );
    await waitFor(() => expect(fetchApi).toHaveBeenCalledOnce());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['http', 'offline', 'invalid-json'] as const)(
    'silently tolerates %s failures',
    async (failure) => {
      vi.mocked(fetchApi).mockImplementation(async () => {
        if (failure === 'offline') throw new Error('offline');
        return failure === 'http' ? new Response('', { status: 503 }) : new Response('bad json');
      });
      render(
        <NetworkReminderProvider>
          <ReminderSurface />
        </NetworkReminderProvider>,
      );
      await waitFor(() => expect(fetchApi).toHaveBeenCalledOnce());
      expect(screen.getByText('groups')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    },
  );

  it('cancels pending checks on logout and ignores late responses', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetchApi).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(
      <NetworkReminderProvider>
        <ReminderSurface />
      </NetworkReminderProvider>,
    );
    const signal = vi.mocked(fetchApi).mock.calls[0][1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    finish(Response.json({ showWarning: true }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
