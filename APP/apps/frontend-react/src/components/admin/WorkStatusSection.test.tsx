import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkStatusSection } from './WorkStatusSection';

const mockFetchSystemConfig = vi.fn();
const mockUpdateSystemConfig = vi.fn();

vi.mock('../../lib/system-config-api', () => ({
  fetchSystemConfig: (...args: unknown[]) => mockFetchSystemConfig(...args),
  updateSystemConfig: (...args: unknown[]) => mockUpdateSystemConfig(...args),
}));

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkStatusSection accessToken="token" />
    </QueryClientProvider>,
  );
}

describe('WorkStatusSection capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSystemConfig.mockResolvedValue({});
  });

  it('shows legacy 打包 definitions as packaging capable', async () => {
    mockFetchSystemConfig.mockResolvedValue({
      workStatusDefs: [{ name: '打包', tone: '#ffd93d', textTone: '#1e1f22' }],
    });

    renderSection();

    const nameInput = await screen.findByDisplayValue('打包');
    const row = nameInput.closest('[data-testid="work-status-row"]');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole('checkbox', { name: '打包能力' })).toBeChecked();
  });

  it('keeps packaging and archive capabilities mutually exclusive when saving', async () => {
    mockFetchSystemConfig.mockResolvedValue({
      workStatusDefs: [
        {
          name: '准备交付',
          tone: '#ffd93d',
          textTone: '#1e1f22',
          isPackaging: true,
        },
      ],
    });
    renderSection();

    const nameInput = await screen.findByDisplayValue('准备交付');
    const row = nameInput.closest('[data-testid="work-status-row"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox', { name: '归档能力' }));

    expect(within(row).getByRole('checkbox', { name: '打包能力' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockUpdateSystemConfig).toHaveBeenCalledWith('token', {
        workStatusDefs: [
          {
            name: '准备交付',
            tone: '#ffd93d',
            textTone: '#1e1f22',
            isPackaging: false,
            isArchive: true,
          },
        ],
      });
    });
  });
});
