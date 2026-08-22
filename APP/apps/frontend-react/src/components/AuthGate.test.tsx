import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';

describe('AuthGate', () => {
  it('submits the email and password through the login action', async () => {
    const user = userEvent.setup();
    const onPasswordLogin = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthGate
          passwordError=""
          isPasswordSubmitting={false}
          onPasswordLogin={onPasswordLogin}
          onPasswordRegister={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.type(screen.getByLabelText('密码'), 'Password1');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(onPasswordLogin).toHaveBeenCalledWith('user@example.com', 'Password1');
    expect(screen.getByRole('button', { name: '没有账号？注册' })).toBeInTheDocument();
  });

  it('switches to registration and submits the new account details', async () => {
    const user = userEvent.setup();
    const onPasswordRegister = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthGate
          passwordError=""
          isPasswordSubmitting={false}
          onPasswordLogin={vi.fn().mockResolvedValue(undefined)}
          onPasswordRegister={onPasswordRegister}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '没有账号？注册' }));

    expect(screen.getByRole('heading', { name: '注册 SekerChat' })).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toHaveAttribute('autocomplete', 'new-password');

    await user.type(screen.getByLabelText('邮箱'), 'new-user@example.com');
    await user.type(screen.getByLabelText('密码'), 'Password1');
    await user.type(screen.getByLabelText('显示名称（选填）'), '新用户');
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(onPasswordRegister).toHaveBeenCalledWith(
      'new-user@example.com',
      'Password1',
      '新用户',
    );
    expect(screen.getByRole('button', { name: '已有账号？登录' })).toBeInTheDocument();
  });

  it('shows an error caused by an actual password login attempt', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthGate
          passwordError="邮箱或密码错误"
          isPasswordSubmitting={false}
          onPasswordLogin={vi.fn().mockResolvedValue(undefined)}
          onPasswordRegister={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('邮箱或密码错误')).toBeInTheDocument();
  });
});
