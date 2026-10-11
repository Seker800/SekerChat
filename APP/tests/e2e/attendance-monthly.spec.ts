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
        userId: 'a0b1c2d3-e4f5-4678-9012-3456789abcde',
        displayName: '月报测试用户',
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
  await expect(report.getByRole('heading', { name: '2026 年 09 月出勤报告' })).toBeVisible();
  await expect(report).toContainText('94%');
  await expect(report).toContainText('用户名 · 月报测试用户');
  await expect(report.getByRole('combobox', { name: '选择月报月份' })).toHaveValue('2026-09');
  await expect(report.locator('[class*="recordRow"]')).toHaveCount(24);
  await expect(report.locator('[class*="recordRow"]').first()).toBeHidden();
  await report.getByRole('combobox', { name: '选择月报月份' }).selectOption('2026-08');
  await report.getByRole('button', { name: /综合完成度/ }).hover();
  await expect(report.getByRole('tooltip')).toContainText('2026-08-24');
  await report.getByRole('combobox', { name: '选择月报月份' }).selectOption('2026-09');
  await report.getByRole('button', { name: /综合完成度/ }).hover();
  await expect(report.getByRole('tooltip')).toContainText('2026-09-24');
  await page.screenshot({ path: testInfo.outputPath('monthly-tooltip-desktop.png') });
  const overall = report.locator('[class*="overall"]').first();
  const online = report.locator('[class*="online"]').first();
  const overallBox = await overall.boundingBox();
  const onlineBox = await online.boundingBox();
  expect(overallBox).not.toBeNull();
  expect(onlineBox).not.toBeNull();
  expect(overallBox!.width).toBeGreaterThan(onlineBox!.width);
  expect(overallBox!.height).toBeGreaterThan(onlineBox!.height);
  await page.mouse.move(0, 0);
  await report.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('monthly-desktop.png') });

  await page.setViewportSize({ width: 850, height: 720 });
  await report.getByRole('button', { name: /在线完成度/ }).hover();
  const narrowTooltip = await report.getByRole('tooltip').boundingBox();
  expect(narrowTooltip).not.toBeNull();
  expect(narrowTooltip!.x + narrowTooltip!.width).toBeLessThanOrEqual(850);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath('monthly-narrow-desktop.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(report).toBeVisible();
  await expect(report.getByRole('heading', { name: '2026 年 09 月出勤报告' })).toBeVisible();
  await expect(report).toContainText('94%');
  await report.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('monthly-mobile.png') });
  await report.getByRole('button', { name: /综合完成度/ }).click();
  await expect(report.getByRole('tooltip')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('monthly-overall-tooltip-mobile.png') });
  expect(
    await report
      .getByRole('tooltip')
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(false);
  await report.getByRole('button', { name: /在线完成度/ }).click();
  await expect(report.getByRole('tooltip')).toContainText('非免打扰在线 126 小时 00 分');
  await page.screenshot({ path: testInfo.outputPath('monthly-tooltip-mobile.png') });
  await report.getByText('查看每日记录').click();
  await expect(report.locator('[class*="recordRow"]').first()).toBeVisible();
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
