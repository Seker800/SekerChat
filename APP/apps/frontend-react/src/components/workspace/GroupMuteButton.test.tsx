import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GroupMuteButton } from './GroupMuteButton';
import type { GroupResponse } from '../../lib/groups-api';

const update = vi.hoisted(() => vi.fn());
vi.mock('../../lib/groups-api', () => ({ updateGroupNotifications: update }));
afterEach(() => update.mockReset());

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['groups'], [{ id: 'ordinary-group' }]);
  const error = vi.fn();
  function Harness() {
    const { data } = useQuery<GroupResponse[]>({ queryKey: ['groups'], enabled: false });
    return <GroupMuteButton group={data![0]} onError={error} />;
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { client, error };
}

it('an ordinary group is unmuted by default, and can mute then unmute without touching other cached groups', async () => {
  update.mockImplementation(async (_auth, groupId, notificationsMuted) => ({
    groupId,
    notificationsMuted,
  }));
  const { client } = setup();
  client.setQueryData(['dms'], [{ id: 'different-conversation', notificationsMuted: false }]);
  expect(screen.getByRole('button', { name: '静音此群' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: '静音此群' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '取消此群静音' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
  expect(client.getQueryData(['dms'])).toEqual([
    { id: 'different-conversation', notificationsMuted: false },
  ]);
  fireEvent.click(screen.getByRole('button', { name: '取消此群静音' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '静音此群' })).toHaveAttribute(
      'aria-pressed',
      'false',
    ),
  );
});

it('a failed save reports the failure and leaves the previous setting intact', async () => {
  update.mockRejectedValue(new Error('保存失败'));
  const { error } = setup();
  fireEvent.click(screen.getByRole('button', { name: '静音此群' }));
  await waitFor(() => expect(error).toHaveBeenCalledWith('保存失败'));
  expect(screen.getByRole('button', { name: '静音此群' })).toHaveAttribute('aria-pressed', 'false');
});
