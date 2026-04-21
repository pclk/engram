import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';

const getFontSize = async (selector: string, page: Page) =>
  page.locator(selector).evaluate((element) =>
    Number.parseFloat(getComputedStyle(element as HTMLElement).fontSize),
  );

const getWidth = async (selector: string, page: Page) =>
  page.locator(selector).evaluate((element) =>
    Math.round((element as HTMLElement).getBoundingClientRect().width),
  );

const setRangeValue = async (page: Page, selector: string, value: number) => {
  await page.locator(selector).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    );
    descriptor?.set?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
};

test('font size shortcuts and display settings adjust the editor layout', async ({
  guestPage,
  page,
}) => {
  await guestPage.goto();
  await page.click('body');

  await page.keyboard.press('l');
  await page.keyboard.press('o');
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const conceptSelector = '[data-testid="concept-text-0"]';
  const derivativeSelector = '[data-testid="derivative-text-0-0"]';
  const blockContainerSelector = '[data-testid="editor-blocks-container"]';

  const conceptFontBefore = await getFontSize(conceptSelector, page);
  const derivativeFontBefore = await getFontSize(derivativeSelector, page);
  const blockWidthBefore = await getWidth(blockContainerSelector, page);

  await page.keyboard.down('Control');
  await page.keyboard.press('=');
  await page.keyboard.up('Control');

  await expect(page.locator('[data-testid="toast"]')).toContainText('Font size');
  const conceptFontAfterIncrease = await getFontSize(conceptSelector, page);
  const derivativeFontAfterIncrease = await getFontSize(derivativeSelector, page);
  expect(conceptFontAfterIncrease).toBeGreaterThan(conceptFontBefore);
  expect(derivativeFontAfterIncrease).toBeGreaterThan(derivativeFontBefore);

  await page.keyboard.down('Control');
  await page.keyboard.press('-');
  await page.keyboard.up('Control');

  const conceptFontAfterDecrease = await getFontSize(conceptSelector, page);
  const derivativeFontAfterDecrease = await getFontSize(derivativeSelector, page);
  expect(conceptFontAfterDecrease).toBeLessThan(conceptFontAfterIncrease);
  expect(derivativeFontAfterDecrease).toBeLessThan(derivativeFontAfterIncrease);

  await guestPage.openSettings();

  const fontSlider = page.locator('[data-testid="editor-font-size-slider"]');
  const fontInput = page.locator('[data-testid="editor-font-size-input"]');
  const widthSlider = page.locator('[data-testid="editor-block-width-slider"]');
  const widthInput = page.locator('[data-testid="editor-block-width-input"]');
  const preview = page.locator('[data-testid="editor-layout-preview"]');

  await setRangeValue(page, '[data-testid="editor-font-size-slider"]', 120);

  await expect(fontSlider).toHaveValue('120');
  await expect
    .poll(async () => getFontSize(conceptSelector, page))
    .toBeGreaterThan(conceptFontAfterDecrease);
  await expect
    .poll(async () => getFontSize(derivativeSelector, page))
    .toBeGreaterThan(derivativeFontAfterDecrease);

  await setRangeValue(page, '[data-testid="editor-block-width-slider"]', 576);

  await expect(widthSlider).toHaveValue('576');
  await expect(preview).toHaveCSS('width', '576px');
  await expect.poll(async () => getWidth(blockContainerSelector, page)).toBeLessThan(
    blockWidthBefore,
  );

  await fontInput.fill('300');
  await fontInput.blur();

  await expect(fontSlider).toHaveValue('300');
  await expect(fontInput).toHaveValue('300');
  await expect
    .poll(async () => getFontSize(conceptSelector, page))
    .toBeGreaterThan(conceptFontAfterIncrease);

  await widthInput.fill('3840');
  await widthInput.blur();

  await expect(widthSlider).toHaveValue('3840');
  await expect(widthInput).toHaveValue('3840');
  await expect(preview).toHaveCSS('width', '3840px');
});
