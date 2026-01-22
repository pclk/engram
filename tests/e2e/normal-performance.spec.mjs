const waitForText = async (page, text, timeout = 10000) => {
	await page.waitForFunction(
		(targetText) => document.body.innerText.includes(targetText),
		{ timeout },
		text
	);
};

const getCursorIndex = async (page) => page.evaluate(() => {
	const container = document.querySelector('[data-testid="concept-text-0"]');
	if (!container) return null;
	const dataIndex = container.getAttribute('data-cursor-index');
	if (dataIndex !== null) {
		const parsed = Number(dataIndex);
		return Number.isNaN(parsed) ? null : parsed;
	}
	const cursor = container.querySelector('.char-cursor');
	if (!cursor) return null;

	let count = 0;
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
	while (walker.nextNode()) {
		const node = walker.currentNode;
		if (cursor.contains(node) || node.parentElement?.classList.contains('char-cursor')) {
			break;
		}
		count += node.textContent?.length ?? 0;
	}

	return count;
});

const waitForCursorIndex = async (page, expected, timeout = 10000) => {
	const start = Date.now();
	let last = null;
	while (Date.now() - start < timeout) {
		last = await getCursorIndex(page);
		if (last === expected) return;
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	throw new Error(`Expected cursor index ${expected}, got ${last}`);
};

export async function run({ page, baseUrl }) {
	const label = 'Normal mode cursor movement performance';
	const startTime = Date.now();
	console.log(`E2E Spec: ${label} - start`);
	const url = new URL('/__e2e', baseUrl).toString();
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForText(page, 'BLOCK - CONCEPT');
	await page.waitForSelector('[data-testid="concept-text-0"]');
	await page.click('body');

	// Enter Normal mode, then Insert to seed large text.
	await page.keyboard.press('i');
	await waitForText(page, 'NORMAL');
	await page.keyboard.press('i');
	await page.waitForSelector('textarea');

	const largeText = 'abcd '.repeat(600); // 3k chars
	await page.type('textarea', largeText, { delay: 0 });

	await page.keyboard.press('Escape');
	await waitForText(page, 'NORMAL');
	await page.waitForFunction(() => {
		const container = document.querySelector('[data-testid="concept-text-0"]');
		return !!container && (container.textContent?.length ?? 0) > 2000;
	});
	await page.keyboard.press('0');
	await waitForCursorIndex(page, 0);

	const moveCount = 200;
	const moveStart = Date.now();
	for (let i = 0; i < moveCount; i += 1) {
		await page.keyboard.press('l');
	}
	await waitForCursorIndex(page, moveCount);
	const moveDuration = Date.now() - moveStart;

	console.log(`E2E Spec: ${label} - moves ${moveCount} in ${moveDuration}ms`);

	// Guardrail threshold: avoid regressions that are egregiously slow.
	if (moveDuration > 6000) {
		throw new Error(`Normal mode movement too slow: ${moveDuration}ms for ${moveCount} moves`);
	}

	const durationMs = Date.now() - startTime;
	console.log(`E2E Spec: ${label} - pass (${durationMs}ms)`);
}
