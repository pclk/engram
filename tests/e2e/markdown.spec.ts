import { test, expect } from './fixtures/test';

test('concept block renders markdown formatting', async ({ page, guestPage }) => {
  await guestPage.goto();
  await page.click('body');

  await page.keyboard.press('i');
  await page.keyboard.press('i');
  await page.locator('textarea').click();
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('- item 1\n- item 2\n\n**bold**, *italic*, `code`');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const conceptBlock = page.locator('[data-testid="concept-text-0"]');
  await expect(conceptBlock.locator('li')).toHaveCount(2);
  await expect(conceptBlock.locator('strong')).toHaveCount(1);
  await expect(conceptBlock.locator('em')).toHaveCount(1);
  await expect(conceptBlock.locator('code')).toHaveCount(1);
});
