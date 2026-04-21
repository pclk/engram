import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test';

const getClickPointForTextOffset = async (
  page: Page,
  selector: string,
  offset: number,
) =>
  page.locator(selector).evaluate((element, requestedOffset) => {
    const target = element as HTMLElement;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, Number(requestedOffset));
    let currentNode = walker.nextNode() as Text | null;

    while (currentNode) {
      const nodeLength = currentNode.textContent?.length ?? 0;
      if (remaining <= nodeLength) {
        const range = document.createRange();
        range.setStart(currentNode, remaining);
        range.collapse(true);
        const rect = range.getClientRects()[0];
        if (rect) {
          return {
            x: rect.left + 1,
            y: rect.top + rect.height / 2,
          };
        }
        break;
      }
      remaining -= nodeLength;
      currentNode = walker.nextNode() as Text | null;
    }

    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + Math.min(Math.max(rect.width / 2, 12), rect.width - 12),
      y: rect.top + rect.height / 2,
    };
  }, offset);

test('clicking text places the cursor and enters insert mode', async ({
  guestPage,
  page,
}) => {
  await guestPage.goto();
  await page.click('body');

  await page.keyboard.press('i');
  await page.keyboard.press('i');

  const textarea = page.locator('textarea');
  await expect(textarea).toBeFocused();
  await textarea.fill('hello world');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const clickPoint = await getClickPointForTextOffset(
    page,
    '[data-testid="concept-text-0"]',
    6,
  );
  await page.mouse.click(clickPoint.x, clickPoint.y);

  await expect(textarea).toBeFocused();
  await expect
    .poll(async () =>
      textarea.evaluate((element) => (element as HTMLTextAreaElement).selectionStart),
    )
    .toBe(6);

  await page.keyboard.type('X');
  await expect(textarea).toHaveValue('hello Xworld');
});

test('shift plus arrow keys create an orange insert-mode selection', async ({
  guestPage,
  page,
}) => {
  await guestPage.goto();
  await page.click('body');

  await page.keyboard.press('i');
  await page.keyboard.press('i');

  const textarea = page.locator('textarea');
  await expect(textarea).toBeFocused();
  await textarea.fill('hello world');

  const endClickPoint = await getClickPointForTextOffset(
    page,
    '[data-testid="concept-text-0"]',
    11,
  );
  await page.mouse.click(endClickPoint.x, endClickPoint.y);

  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');

  await expect
    .poll(async () =>
      textarea.evaluate((element) => ({
        start: (element as HTMLTextAreaElement).selectionStart,
        end: (element as HTMLTextAreaElement).selectionEnd,
      })),
    )
    .toEqual({ start: 9, end: 11 });

  await expect
    .poll(async () =>
      page.locator('[data-testid="concept-text-0"]').evaluate((element) =>
        Array.from(element.querySelectorAll('span')).filter((span) =>
          (span.className || '').includes('bg-[#ff9e64]'),
        ).length,
      ),
    )
    .toBeGreaterThan(0);

  await page.keyboard.type('X');
  await expect(textarea).toHaveValue('hello worX');
});
