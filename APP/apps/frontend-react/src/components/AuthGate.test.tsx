import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';

describe('AuthGate', () => {
  it('submits the email and password through the only available action', async () => {
    const user = userEvent.setup();
    const onPasswordLogin = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthGate
          passwordError=""
          isPasswordSubmitting={false}
          onPasswordLogin={onPasswordLogin}
        />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.type(screen.getByLabelText('密码'), 'Password1');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(onPasswordLogin).toHaveBeenCalledWith('user@example.com', 'Password1');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows an error caused by an actual password login attempt', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthGate
          passwordError="邮箱或密码错误"
          isPasswordSubmitting={false}
          onPasswordLogin={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('邮箱或密码错误')).toBeInTheDocument();
  });
});
