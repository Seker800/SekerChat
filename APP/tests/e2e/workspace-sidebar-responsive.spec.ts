import { expect, test } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures/app-fixture';

test.describe('workspace sidebar responsive behavior', () => {
  test('collapses the sidebar on narrow screens and allows manual reopen', async ({ page }) => {
    await page.setViewportSize({ width: 840, height: 1024 });
    await installAuthenticatedApp(page);
    await page.goto('/groups/group-1');

    await expect(page.getByTestId('groups-workspace')).toBeVisible();
    await expect(page.getByTestId('sidebar-toggle-button')).toBeVisible();
    await expect(page.getByTestId('sidebar-backdrop')).toBeHidden();
    await expect(page.getByTestId('right-sidebar-backdrop')).toBeHidden();
    await expect(page.getByTestId('sidebar-close-button')).toBeHidden();
    await expect(page.getByTestId('groups-workspace')).toHaveScreenshot('workspace-mobile-collapsed.png', {
      animations: 'disabled',
      caret: 'hide',
    });

    await page.getByTestId('sidebar-toggle-button').click();
    await expect(page.getByTestId('sidebar-backdrop')).toBeVisible();
    await expect(page.getByTestId('sidebar-close-button')).toBeVisible();
    await expect(page.getByTestId('groups-sidebar')).toBeVisible();
    await page.getByTestId('sidebar-close-button').click();
    await expect(page.getByTestId('sidebar-backdrop')).toBeHidden();

    await page.getByTestId('open-info-sidebar-button').click();
    await expect(page.getByTestId('right-sidebar-backdrop')).toBeVisible();
    await expect(page.getByTestId('members-surface')).toBeVisible();
    await page.getByTestId('right-sidebar-close-button').click();
    await expect(page.getByTestId('right-sidebar-backdrop')).toBeHidden();
  });

  test('keeps secondary surfaces usable on compact desktop widths', async ({ page }) => {
    await page.setViewportSize({ width: 1002, height: 953 });
    await installAuthenticatedApp(page);
    await page.goto('/groups/group-1');

    await expect(page.getByTestId('groups-workspace')).toBeVisible();
    await expect(page.getByTestId('right-sidebar-backdrop')).toBeHidden();

    await page.getByTestId('open-info-sidebar-button').click();
    await expect(page.getByTestId('right-sidebar-backdrop')).toBeVisible();
    await expect(page.getByText('产出', { exact: true })).toBeVisible();

    await page.locator('[data-group-id="group-1"]').dispatchEvent('contextmenu', {
      button: 2,
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 180,
    });
    await expect(page.getByRole('menuitem', { name: '打开频道设置' })).toBeVisible();
    await page.getByRole('menuitem', { name: '打开频道设置' }).dispatchEvent('click');
    await expect(page.getByTestId('channel-settings-dialog')).toBeVisible();
    await page.getByTestId('channel-settings-dialog').getByRole('button', { name: '关闭', exact: true }).click();

    await page.getByTestId('right-sidebar-close-button').click();
    await expect(page.getByTestId('right-sidebar-backdrop')).toBeHidden();
  });
});
