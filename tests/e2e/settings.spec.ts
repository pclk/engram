import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';

const getFontSize = async (selector: string, page: Page) =>
  page.locator(selector).evaluate((element) =>
    Number.parseFloat(getComputedStyle(element as HTMLElement).fontSize),
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

  const conceptFontBefore = await getFontSize(conceptSelector, page);
  const derivativeFontBefore = await getFontSize(derivativeSelector, page);

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

  await page.keyboard.press(' ');
  await page.keyboard.press('s');
  await expect(guestPage.settingsModal).toBeVisible();
  await expect(page.getByTestId('open-size-editor')).toBeVisible();
  await page.getByTestId('open-size-editor').click();
  await expect(page.getByTestId('size-editor')).toBeVisible();

  const conceptFontSlider = page.locator('[data-testid="editor-font-size-slider"]');
  const conceptFontInput = page.locator('[data-testid="editor-font-size-input"]');
  const derivativeFontSlider = page.locator(
    '[data-testid="editor-derivative-font-size-slider"]',
  );
  const derivativeFontInput = page.locator(
    '[data-testid="editor-derivative-font-size-input"]',
  );
  const widthSlider = page.locator('[data-testid="editor-block-width-slider"]');
  const widthInput = page.locator('[data-testid="editor-block-width-input"]');
  const conceptFontPxUnit = page.getByTestId('editor-font-size-unit-px');
  const conceptFontPercentUnit = page.getByTestId(
    'editor-font-size-unit-percent',
  );
  const derivativeFontPxUnit = page.getByTestId(
    'editor-derivative-font-size-unit-px',
  );
  const derivativeFontPercentUnit = page.getByTestId(
    'editor-derivative-font-size-unit-percent',
  );
  const widthPxUnit = page.getByTestId('editor-block-width-unit-px');
  const widthPercentUnit = page.getByTestId('editor-block-width-unit-percent');
  const sample = page.locator('[data-testid="size-editor-sample"]');

  await setRangeValue(page, '[data-testid="editor-font-size-slider"]', 120);

  await expect(conceptFontSlider).toHaveValue('120');
  await expect(conceptFontInput).toHaveValue('120%');
  await expect(conceptFontPercentUnit).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => getFontSize('[data-testid="size-editor-concept-sample"]', page))
    .toBeGreaterThan(conceptFontAfterDecrease);

  await conceptFontPxUnit.click();
  await expect(conceptFontPxUnit).toHaveAttribute('aria-pressed', 'true');
  await expect(conceptFontSlider).toHaveAttribute('min', '8');
  await expect(conceptFontSlider).toHaveAttribute('max', '64');
  await expect(conceptFontInput).toHaveValue('21.5px');

  await setRangeValue(page, '[data-testid="editor-font-size-slider"]', 22);
  await expect(conceptFontSlider).toHaveValue('22');
  await expect(conceptFontInput).toHaveValue('22px');
  await expect
    .poll(async () => getFontSize('[data-testid="size-editor-concept-sample"]', page))
    .toBeGreaterThan(21);

  await conceptFontPercentUnit.click();
  await expect(conceptFontPercentUnit).toHaveAttribute('aria-pressed', 'true');
  await expect(conceptFontSlider).toHaveAttribute('min', '50');
  await expect(conceptFontSlider).toHaveAttribute('max', '300');

  await setRangeValue(
    page,
    '[data-testid="editor-derivative-font-size-slider"]',
    150,
  );

  await expect(derivativeFontSlider).toHaveValue('150');
  await expect(derivativeFontInput).toHaveValue('150%');
  await expect(derivativeFontPercentUnit).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () =>
      getFontSize('[data-testid="size-editor-derivative-sample"]', page),
    )
    .toBeGreaterThan(derivativeFontAfterDecrease);

  await derivativeFontPxUnit.click();
  await expect(derivativeFontPxUnit).toHaveAttribute('aria-pressed', 'true');
  await expect(derivativeFontSlider).toHaveAttribute('max', '64');
  await expect(derivativeFontInput).toHaveValue('21px');

  await widthInput.fill('80%');
  await widthInput.blur();

  await expect(widthSlider).toHaveValue('80');
  await expect(widthInput).toHaveValue('80%');
  await expect(widthPercentUnit).toHaveAttribute('aria-pressed', 'true');
  await expect(sample).toHaveAttribute('style', /max-width: 80%;/);

  await widthPxUnit.click();
  await expect(widthPxUnit).toHaveAttribute('aria-pressed', 'true');
  await expect(widthSlider).toHaveAttribute('max', '3840');
  await expect(widthInput).toHaveValue(/px$/);

  await setRangeValue(page, '[data-testid="editor-block-width-slider"]', 960);
  await expect(widthSlider).toHaveValue('960');
  await expect(widthInput).toHaveValue('960px');
  await expect(sample).toHaveCSS('max-width', '960px');

  await conceptFontInput.fill('21px');
  await conceptFontInput.blur();

  await expect(conceptFontInput).toHaveValue('21px');
  await expect
    .poll(async () => getFontSize('[data-testid="size-editor-concept-sample"]', page))
    .toBeGreaterThan(20);

  await page.getByTestId('close-size-editor').click();
  await expect(page.getByTestId('size-editor')).toHaveCount(0);
  await expect
    .poll(async () => getFontSize(conceptSelector, page))
    .toBeGreaterThan(20);

  await page.keyboard.press(' ');
  await page.keyboard.press('s');
  await page.getByTestId('open-size-editor').click();

  await widthInput.fill('3840px');
  await widthInput.blur();

  await expect(widthSlider).toHaveValue('3840');
  await expect(widthInput).toHaveValue('3840px');
  await expect(sample).toHaveCSS('max-width', '3840px');
});
