import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceStartupScreen } from './WorkspaceStartupScreen';

describe('WorkspaceStartupScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the four workspace regions immediately and delays the status text', () => {
    vi.useFakeTimers();

    render(<WorkspaceStartupScreen message="正在恢复登录状态..." messageDelayMs={500} />);

    expect(screen.getByLabelText('server栏加载占位')).toBeInTheDocument();
    expect(screen.getByLabelText('频道栏加载占位')).toBeInTheDocument();
    expect(screen.getByLabelText('消息栏加载占位')).toBeInTheDocument();
    expect(screen.getByLabelText('信息栏加载占位')).toBeInTheDocument();
    expect(screen.queryByText('正在恢复登录状态...')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.queryByText('正在恢复登录状态...')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('正在恢复登录状态...')).toBeInTheDocument();
  });
});
