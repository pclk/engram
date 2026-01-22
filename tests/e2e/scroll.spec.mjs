const waitForText = async (page, text, timeout = 10000) => {
	await page.waitForFunction(
		(targetText) => document.body.innerText.includes(targetText),
		{ timeout },
		text
	);
};

const setTextareaValue = async (page, text) => {
	await page.evaluate((value) => {
		const textarea = document.querySelector('textarea');
		if (!textarea) return;
		textarea.value = value;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	}, text);
};

export async function run({ page, baseUrl }) {
	const label = 'Scroll behavior for long blocks';
	console.log(`E2E Spec: ${label} - start`);
	const url = new URL('/__e2e', baseUrl).toString();
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await waitForText(page, 'BLOCK - CONCEPT');
	await page.waitForSelector('[data-testid="concept-text-0"]');
	await page.click('body');

	await page.keyboard.press('i');
	await waitForText(page, 'NORMAL');
	await page.keyboard.press('i');
	await page.waitForSelector('textarea');

	const longText = Array.from({ length: 300 }, (_, i) => `Line ${i} lorem ipsum dolor sit amet.`).join('\n');
	await setTextareaValue(page, longText);

	await page.keyboard.press('Escape');
	await waitForText(page, 'NORMAL');
	await page.keyboard.press('Escape');
	await waitForText(page, 'BLOCK - CONCEPT');

	await page.waitForFunction(() => {
		const container = document.querySelector('[data-testid="scroll-container"]');
		if (!container) return false;
		return container.scrollTop <= 20;
	});

	await page.keyboard.press('i');
	await waitForText(page, 'NORMAL');

	for (let i = 0; i < 80; i++) {
		await page.keyboard.press('j');
	}

	await page.waitForFunction(() => {
		const container = document.querySelector('[data-testid="scroll-container"]');
		const cursor = document.querySelector('[data-testid="concept-block-0"] .char-cursor');
		if (!container || !cursor) return false;
		const containerRect = container.getBoundingClientRect();
		const cursorRect = cursor.getBoundingClientRect();
		return cursorRect.top >= containerRect.top && cursorRect.bottom <= containerRect.bottom;
	});

	console.log(`E2E Spec: ${label} - passed`);
}
