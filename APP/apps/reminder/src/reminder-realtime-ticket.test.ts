import { describe, expect, it, vi } from 'vitest';
import { createRealtimeUrl, requestRealtimeTicket } from './reminder-realtime-ticket';

describe('reminder realtime ticket transport', () => {
  it('keeps the long-lived device token in the HTTPS header and out of the WebSocket URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ticket: 'one-time-ticket',
      expiresAt: '2026-08-11T10:01:00.000Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const payload = await requestRealtimeTicket(
      'https://im.example.com/api',
      'long-lived-device-secret',
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://im.example.com/api/auth/reminder/realtime-ticket',
      {
        method: 'POST',
        headers: { 'x-reminder-device-token': 'long-lived-device-secret' },
      },
    );
    const realtimeUrl = createRealtimeUrl('https://im.example.com/api', payload.ticket);
    expect(realtimeUrl).toBe('wss://im.example.com/realtime?ticket=one-time-ticket');
    expect(realtimeUrl).not.toMatch(/long-lived-device-secret|deviceToken/);
  });
});
