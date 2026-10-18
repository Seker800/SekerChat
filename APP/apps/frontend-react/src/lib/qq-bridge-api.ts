import { apiBaseUrl, fetchApi, parseResponse } from './api-core';

import type { components } from '@sekerchat/contracts/openapi';

type Schemas = components['schemas'];
export type BridgeConnector = Schemas['QqBridgeConnectorResponseDto'];
export type BridgeBinding = Schemas['QqBridgeBindingResponseDto'];
export type BridgeDelivery = Schemas['QqBridgeTaskResponseDto'];
export type BridgeOverview = Schemas['QqBridgeOverviewResponseDto'];

export async function bridgeApi<T>(path = '', method = 'GET', body?: unknown): Promise<T> {
  return parseResponse<T>(
    await fetchApi(`${apiBaseUrl}/extensions/qq-bridge${path}`, {
      method,
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    }),
  );
}
