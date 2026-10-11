import { expect, test } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures/app-fixture';

test('personal monthly report shows completion and daily records at desktop and mobile widths', async ({
  page,
}, testInfo) => {
  await installAuthenticatedApp(page);
  await page.route('**/api/attendance/me/monthly', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            month: '2026-09',
            generatedAt: '2026-10-01T00:05:00.000Z',
            summary: { expectedWorkDays: 18, overallCompletionPercent: 94 },
            dayCount: 24,
          },
          {
            month: '2026-08',
            generatedAt: '2026-09-01T00:05:00.000Z',
            summary: { expectedWorkDays: 20, overallCompletionPercent: 72 },
            dayCount: 24,
          },
        ],
      }),
    });
  });
  await page.route('**/api/attendance/me/monthly/*', async (route) => {
    const month = route.request().url().split('/').at(-1)!;
    const days = Array.from({ length: 24 }, (_, index) => ({
      workDate: `${month}-${String(index + 1).padStart(2, '0')}`,
      isWorkday: index % 7 < 5,
      status: index % 4 === 0 ? 'NOT_CHECKED_IN' : 'CHECKED_OUT',
      checkInAt:
        index % 4 === 0 ? null : `${month}-${String(index + 1).padStart(2, '0')}T01:00:00.000Z`,
      checkOutAt:
        index % 4 === 0 ? null : `${month}-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
      onlineMinutes: index % 4 === 0 ? 0 : 420,
      checkInMinutes: index % 4 === 0 ? 0 : 480,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        month,
        generatedAt: '2026-10-01T00:05:00.000Z',
        timezone: 'Asia/Shanghai',
        targetDailyMinutes: 480,
        range: {
          startDate: `${month}-01`,
          endDate: `${month}-31`,
          effectiveStartDate: `${month}-01`,
          effectiveEndDate: `${month}-24`,
        },
        summary: {
          expectedWorkDays: 18,
          targetMinutes: 8640,
          onlineTotalMinutes: 7560,
          checkInTotalMinutes: 8640,
          onlineCompletionPercent: 88,
          checkInCompletionPercent: 100,
          overallCompletionPercent: 94,
        },
        days,
      }),
    });
  });

  await page.goto('/dm/__dm_attendance__');
  await page.getByRole('tab', { name: '我的月报' }).click();
  const report = page.getByTestId('attendance-monthly-report');
  await expect(report).toContainText('综合完成度');
  await expect(report).toContainText('94%');
  await expect(report).toContainText('09-24');
  await expect(report).not.toContainText('2026 年 10 月');
  await expect(report.locator('[class*="recordRow"]')).toHaveCount(24);
  await page.getByRole('button', { name: /2026 年 08 月/ }).click();
  await expect(report).toContainText('08-24');
  await page.getByRole('button', { name: /2026 年 09 月/ }).click();
  await expect(report).toContainText('09-24');
  await page.screenshot({ path: testInfo.outputPath('monthly-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(report).toBeVisible();
  await expect(report).toContainText('94%');
  await page.screenshot({ path: testInfo.outputPath('monthly-mobile.png'), fullPage: true });
  await report.locator('[class*="recordRow"]').last().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('monthly-mobile-records.png'),
    fullPage: true,
  });
  const overflows = await report.evaluate(
    (element) => element.scrollWidth > element.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});
