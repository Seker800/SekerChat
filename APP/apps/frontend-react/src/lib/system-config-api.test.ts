import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSystemConfig } from './system-config-api';

describe('fetchSystemConfig work-status compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes legacy 打包 definitions without overriding an explicit false value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              workStatusDefs: JSON.stringify([
                { name: '打包', tone: '#ffd93d', textTone: '#1e1f22' },
                {
                  name: '无需产出',
                  tone: '#6c757d',
                  textTone: '#ffffff',
                  isPackaging: false,
                },
              ]),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const config = await fetchSystemConfig('token');

    expect(config.workStatusDefs).toEqual([
      expect.objectContaining({ name: '打包', isPackaging: true }),
      expect.objectContaining({ name: '无需产出', isPackaging: false }),
    ]);
  });
});
