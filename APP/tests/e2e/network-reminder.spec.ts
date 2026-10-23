import { expect, test } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures/app-fixture';

test.beforeEach(async ({ page }) => {
  await installAuthenticatedApp(page);
  await page.route('**/api/attendance/me/checkin/today', (route) =>
    route.fulfill({
      json: {
        workDate: '2026-04-10',
        status: 'NOT_CHECKED_IN',
        checkInAt: null,
        checkOutAt: null,
        checkInMinutes: 0,
        onlineMinutes: 110,
      },
    }),
  );
});

test('network reminder closes until reload and leaves attendance available', async ({ page }) => {
  let checks = 0;
  await page.route('**/api/network/status', async (route) => {
    checks++;
    await route.fulfill({ json: { showWarning: true } });
  });
  await page.goto('/groups/group-1');
  const reminder = page.getByRole('status', { name: '网络提醒' });
  await expect(reminder).toBeVisible();
  await expect(reminder).toContainText('中国大陆以外');
  await expect(reminder.getByRole('button')).toHaveCount(1);
  const initialChecks = checks;
  await page
    .getByTestId('groups-sidebar')
    .screenshot({ path: 'test-results/network-reminder-sidebar.png' });
  await reminder.getByRole('button', { name: '知道了', exact: true }).click();
  await expect(reminder).toHaveCount(0);
  await expect(page.getByTestId('attendance-popover')).toBeVisible();
  // Client navigation must not start a new detection or undo acknowledgement.
  await page.evaluate(() => {
    history.pushState({}, '', '/groups/group-2');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(reminder).toHaveCount(0);
  expect(checks).toBe(initialChecks);
  await page.reload();
  await expect(reminder).toBeVisible();
  expect(checks).toBeGreaterThan(initialChecks);
});

for (const scenario of ['mainland', 'failed', 'unknown'] as const) {
  test(`does not interrupt the workspace when network detection is ${scenario}`, async ({
    page,
  }) => {
    await page.route('**/api/network/status', (route) =>
      route.fulfill(
        scenario === 'failed'
          ? { status: 503, json: { message: 'unavailable' } }
          : { json: scenario === 'unknown' ? {} : { showWarning: false } },
      ),
    );
    await page.goto('/groups/group-1');
    await expect(page.getByTestId('workspace-composer-panel')).toBeVisible();
    await expect(page.getByTestId('attendance-popover')).toBeVisible();
    await expect(page.getByRole('status', { name: '网络提醒' })).toHaveCount(0);
  });
}

test('uses the existing reminder card in the narrow-screen sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/network/status', (route) =>
    route.fulfill({ json: { showWarning: true } }),
  );
  await page.goto('/groups/group-1');
  await page.getByTestId('sidebar-toggle-button').click();
  const reminder = page.getByRole('status', { name: '网络提醒' });
  await expect(reminder).toBeVisible();
  await expect.poll(async () => (await reminder.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
  const bounds = await reminder.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/network-reminder-mobile.png' });
  await reminder.getByRole('button', { name: '知道了' }).click();
  await expect(reminder).toHaveCount(0);
});
