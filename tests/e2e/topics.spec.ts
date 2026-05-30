import { test, expect } from './fixtures/test';

test('can create a guest topic via keyboard controls', async ({ guestPage }) => {
  const topicTitle = process.env.E2E_TOPIC_TITLE ?? 'E2E Topic';

  await guestPage.goto();
  await guestPage.createTopicWithKeyboard(topicTitle);

  await expect(guestPage.currentTopicTitle()).toHaveText(topicTitle);
});

test('supports shifted normal-mode line shortcuts', async ({ guestPage, page }) => {
  await guestPage.goto();
  await page.click('body');

  await page.keyboard.press('i');
  await page.keyboard.press('i');

  const textarea = page.locator('textarea');
  await expect(textarea).toBeFocused();
  await textarea.fill('alpha\nbeta');

  await page.keyboard.press('Escape');
  await page.keyboard.press('0');

  await page.keyboard.press('Shift+Y');
  await expect(page.locator('[data-testid="markdown-copy"]')).toHaveText('alpha');

  await page.keyboard.press('Shift+V');
  await expect
    .poll(async () =>
      guestPage.firstConceptText.evaluate((element) =>
        Array.from(element.querySelectorAll('span')).filter((span) =>
          (span.className || '').includes('bg-[#bb9af7]'),
        ).length,
      ),
    )
    .toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+D');
  await expect(guestPage.firstConceptText).toHaveText('beta');

  await page.keyboard.press('i');
  await expect(textarea).toBeFocused();
  await textarea.fill('alpha\nbeta');

  await page.keyboard.press('Escape');
  await page.keyboard.press('0');
  await page.keyboard.press('Shift+C');

  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveValue('beta');
});

test('filters topic blocks with slash query and resets with slash', async ({ guestPage, page }) => {
  await guestPage.goto();
  await page.click('body');

  await page.keyboard.press('i');
  await page.keyboard.press('i');

  const textarea = page.locator('textarea');
  await expect(textarea).toBeFocused();
  await textarea.fill('alpha target');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('o');
  await expect(textarea).toBeFocused();
  await textarea.fill('gamma hidden');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await expect(page.locator('[data-testid="concept-text-0"]')).toBeVisible();
  await expect(page.locator('[data-testid="concept-text-1"]')).toBeVisible();

  await page.keyboard.press('/');
  await page.keyboard.type('alpha');

  await expect(page.getByTestId('topic-filter')).toContainText('alpha');
  await expect(page.locator('[data-testid="concept-text-0"]')).toBeVisible();
  await expect(page.locator('[data-testid="concept-text-1"]')).toHaveCount(0);

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('topic-filter')).toContainText('alpha');

  await page.keyboard.press('/');
  await expect(page.getByTestId('topic-filter')).toHaveCount(0);
  await expect(page.locator('[data-testid="concept-text-1"]')).toBeVisible();
});
