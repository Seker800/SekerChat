import { expect, test } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures/app-fixture';

test('minute checks update today without reloading history, and pause in a hidden window', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-04-10T12:00:00Z') });
  await installAuthenticatedApp(page);
  let todayReads = 0;
  let onlineHistoryReads = 0;
  let checkInHistoryReads = 0;
  let checkedOut = false;
  const day = '2026-04-10';
  const today = () => ({
    workDate: day,
    status: checkedOut ? 'CHECKED_OUT' : 'CHECKED_IN',
    checkInAt: `${day}T01:00:00Z`,
    checkOutAt: checkedOut ? `${day}T09:00:00Z` : null,
    checkInMinutes: checkedOut ? 480 : 60,
    onlineMinutes: 60,
    todaySegments: [],
  });
  await page.route('**/api/attendance/me/checkin/today', async (route) => {
    todayReads++;
    await route.fulfill({ json: today() });
  });
  await page.route('**/api/attendance/me/panel?**', async (route) => {
    onlineHistoryReads++;
    await route.fulfill({
      json: {
        summary: { dayWorkedMinutes: 60 },
        todaySegments: [],
        dailySeries: [{ workDate: day, onlineMinutes: 60 }],
        range: { endDate: day },
      },
    });
  });
  await page.route('**/api/attendance/me/checkin/panel?**', async (route) => {
    checkInHistoryReads++;
    await route.fulfill({
      json: {
        today: today(),
        summary: {
          checkedInDays: 1,
          completedDays: 0,
          completionRate: 0,
          consecutiveCheckInDays: 1,
          averages: {
            online: {
              monthAverageMinutes: 60,
              totalAverageMinutes: 60,
              basis: {
                monthWorkedMinutes: 60,
                yearWorkedMinutes: 60,
                monthWorkDays: 1,
                yearWorkDays: 1,
              },
            },
            checkIn: {
              monthAverageMinutes: 60,
              totalAverageMinutes: 60,
              basis: {
                monthWorkedMinutes: 60,
                yearWorkedMinutes: 60,
                monthWorkDays: 1,
                yearWorkDays: 1,
              },
            },
          },
        },
        statusSeries: [today()],
        recentRecords: [today()],
        checkInSeries: [{ workDate: day, checkInMinutes: 60 }],
        onlineSeries: [{ workDate: day, onlineMinutes: 60 }],
        range: { endDate: day },
      },
    });
  });
  await page.goto('/dm/__dm_attendance__');
  await page.evaluate(() => {
    Date.now = (
      window as unknown as { __playwrightOriginalDateNow: () => number }
    ).__playwrightOriginalDateNow;
  });
  await expect(page.getByRole('button', { name: '下班签退', exact: true })).toBeVisible();
  const initialReads = todayReads;
  for (let minute = 1; minute <= 10; minute++) {
    if (minute === 5) checkedOut = true; // An operation performed by another device.
    await page.clock.runFor(60_000);
    await expect.poll(() => todayReads).toBe(initialReads + minute);
  }
  await expect(page.getByRole('button', { name: '再次上班签到', exact: true })).toBeVisible();
  await expect(
    page.getByTestId('attendance-summary-matrix').getByText('8h 00m', { exact: true }),
  ).toHaveCount(3);
  expect(onlineHistoryReads).toBe(1);
  expect(checkInHistoryReads).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await page.clock.runFor(600_000);
  expect(todayReads).toBe(initialReads + 10);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await page.clock.runFor(1);
  await expect.poll(() => todayReads).toBe(initialReads + 11);
  expect(onlineHistoryReads).toBe(1);
  expect(checkInHistoryReads).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('attendance-after-cross-device-change.png') });
});

test('a closed mobile information panel does not request tasks until opened', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthenticatedApp(page);
  let taskReads = 0;
  await page.route('**/api/groups/group-1/tasks', async (route) => {
    taskReads++;
    await route.fulfill({ json: [] });
  });
  await page.goto('/groups/group-1');
  await expect(page.getByTestId('open-info-sidebar-button')).toBeVisible();
  expect(taskReads).toBe(0);
  await page.getByTestId('open-info-sidebar-button').click();
  await expect.poll(() => taskReads).toBe(1);
});
