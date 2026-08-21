import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RequiredPasswordChange } from './RequiredPasswordChange';

describe('RequiredPasswordChange', () => {
  it('submits the temporary and new passwords after local validation', async () => {
    const onChangePassword = vi.fn().mockResolvedValue(undefined);
    render(
      <RequiredPasswordChange
        email="member@example.com"
        onChangePassword={onChangePassword}
        onLogout={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('当前临时密码'), { target: { value: 'TempPass2' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'FreshPass3' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'FreshPass3' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码并继续' }));

    await waitFor(() => {
      expect(onChangePassword).toHaveBeenCalledWith('TempPass2', 'FreshPass3');
    });
  });
});
