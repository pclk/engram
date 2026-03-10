import { test, expect } from './fixtures/test';

test('can create nested folders and a note from the selected folder', async ({ guestPage, page }) => {
  await guestPage.goto();
  await guestPage.openTopicSwitcher();

  const activeNameInput = guestPage.topicSwitcher.locator('input[data-testid^="topic-name-input-"]');

  await page.keyboard.press('O');
  await expect(activeNameInput).toBeVisible();
  await expect(activeNameInput).toBeFocused();
  await activeNameInput.fill('Projects');
  await page.keyboard.press('Enter');
  await expect(guestPage.topicSwitcher.getByText('Projects', { exact: true })).toBeVisible();

  await page.keyboard.press('O');
  await expect(activeNameInput).toBeVisible();
  await expect(activeNameInput).toBeFocused();
  await activeNameInput.fill('Ideas');
  await page.keyboard.press('Enter');
  await expect(guestPage.topicSwitcher.getByText('Ideas', { exact: true })).toBeVisible();

  await page.keyboard.press('o');
  await expect(activeNameInput).toBeVisible();
  await expect(activeNameInput).toBeFocused();
  await activeNameInput.fill('Nested Note');
  await page.keyboard.press('Enter');

  await expect(guestPage.topicSwitcher).toBeHidden();
  await expect(guestPage.currentTopicTitle()).toHaveText('/Projects/Ideas/Nested Note');
});

test('can rename a note and open it with Enter from the filesystem switcher', async ({ guestPage, page }) => {
  await guestPage.goto();
  await guestPage.createTopicWithKeyboard('Old Name');

  await guestPage.openTopicSwitcher();
  await guestPage.topicSwitcher.locator('[data-testid^="topic-item-"]').filter({ hasText: 'Old Name' }).first().click();
  await page.keyboard.press('c');
  const activeNameInput = guestPage.topicSwitcher.locator('input[data-testid^="topic-name-input-"]');
  await expect(activeNameInput).toBeVisible();
  await expect(activeNameInput).toBeFocused();
  await activeNameInput.fill('Renamed Note');
  await page.keyboard.press('Enter');

  await expect(guestPage.topicSwitcher).toBeHidden();
  await expect(guestPage.currentTopicTitle()).toHaveText('Renamed Note');
});

test('can delete the selected note with dd from the filesystem switcher', async ({ guestPage, page }) => {
  await guestPage.goto();
  await guestPage.createTopicWithKeyboard('Delete Me');

  await guestPage.openTopicSwitcher();
  await guestPage.topicSwitcher.locator('[data-testid^="topic-item-"]').filter({ hasText: 'Delete Me' }).first().click();
  await page.keyboard.press('d');
  await expect(guestPage.topicSwitcher.getByText('Delete armed:', { exact: false })).toBeVisible();

  await page.keyboard.press('d');

  await expect(guestPage.topicSwitcher.getByText('Delete Me', { exact: true })).toHaveCount(0);
  await expect(guestPage.currentTopicTitle()).not.toHaveText('Delete Me');
});
