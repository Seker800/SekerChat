import { expect, test } from '@playwright/test';
import { installAuthenticatedAppWithOptions } from './fixtures/app-fixture';

const users = [
  {
    id: 'user-admin',
    email: 'admin@local.invalid',
    displayName: '管理员',
    role: 'SUPER_ADMIN',
    attendanceMode: 'FLEXIBLE',
  },
  {
    id: 'user-member',
    email: 'member@local.invalid',
    displayName: '值班同学',
    role: 'MEMBER',
    attendanceMode: 'FLEXIBLE',
  },
];

test('admin attendance compares check-in and online averages', async ({ page }) => {
  await installAuthenticatedAppWithOptions(page, {
    currentUserOverride: {
      role: 'SUPER_ADMIN',
    },
  });

  await page.route('**/api/system-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          attendanceTimezone: 'Asia/Shanghai',
          attendanceActiveWindowMinutes: '120',
        }),
      });
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/attendance/**', async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname === '/api/attendance/users/averages') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              user: users[0],
              checkIn: {
                todayMinutes: 135,
                monthAverageMinutes: 64,
                totalAverageMinutes: 70,
              },
              online: {
                todayMinutes: 95,
                monthAverageMinutes: 55,
                totalAverageMinutes: 60,
              },
            },
            {
              user: users[1],
              checkIn: {
                todayMinutes: 45,
                monthAverageMinutes: 21,
                totalAverageMinutes: 25,
              },
              online: {
                todayMinutes: 25,
                monthAverageMinutes: 18,
                totalAverageMinutes: 20,
              },
            },
          ],
          total: users.length,
        }),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto('/admin');
  await page.getByRole('button', { name: '出勤', exact: true }).click();

  const section = page.locator('section', { hasText: '查看所有成员签到与在线时长统计' });
  await expect(section.getByRole('heading', { name: '出勤', exact: true })).toBeVisible();
  await expect(section.getByText('签到', { exact: true })).toBeVisible();
  await expect(section.getByText('在线', { exact: true })).toBeVisible();

  const checkInTable = section.getByTestId('attendance-checkIn-table');
  const onlineTable = section.getByTestId('attendance-online-table');
  await expect(checkInTable.getByRole('row', { name: /管理员/ })).toContainText('2小时15分');
  await expect(onlineTable.getByRole('row', { name: /管理员/ })).toContainText('1小时35分');

  await checkInTable.getByRole('button', { name: '月平均' }).click();
  await expect(checkInTable.getByRole('button', { name: '月平均 ↓' })).toBeVisible();
  await expect(checkInTable.getByRole('row').nth(1)).toContainText('管理员');
  await expect(checkInTable.getByRole('row').nth(1)).toContainText('1小时04分');

  await onlineTable.getByRole('button', { name: '今日时长' }).click();
  await expect(onlineTable.getByRole('button', { name: '今日时长 ↓' })).toBeVisible();
  await expect(onlineTable.getByRole('row').nth(1)).toContainText('管理员');
});
