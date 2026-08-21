import type { components } from '@sekerchat/contracts/openapi';

export type ReminderRealtimeTicketResponse =
  components['schemas']['ReminderRealtimeTicketResponseDto'];

export class RealtimeTicketRequestError extends Error {
  constructor(readonly status: number) {
    super(`Realtime ticket request failed (${status}).`);
  }
}

export function createRealtimeUrl(apiBaseUrl: string, ticket: string): string {
  const realtimeUrl = new URL(apiBaseUrl);
  realtimeUrl.protocol = realtimeUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  realtimeUrl.pathname = '/realtime';
  realtimeUrl.search = '';
  realtimeUrl.hash = '';
  realtimeUrl.searchParams.set('ticket', ticket);
  return realtimeUrl.toString();
}

export async function requestRealtimeTicket(
  apiBaseUrl: string,
  deviceToken: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<ReminderRealtimeTicketResponse> {
  const response = await fetchImplementation(
    `${apiBaseUrl.replace(/\/+$/, '')}/auth/reminder/realtime-ticket`,
    {
      method: 'POST',
      headers: { 'x-reminder-device-token': deviceToken },
    },
  );
  if (!response.ok) {
    throw new RealtimeTicketRequestError(response.status);
  }
  const payload = (await response.json()) as Partial<ReminderRealtimeTicketResponse>;
  if (!payload.ticket || !payload.expiresAt) {
    throw new Error('Realtime ticket response is invalid.');
  }
  return { ticket: payload.ticket, expiresAt: payload.expiresAt };
}
