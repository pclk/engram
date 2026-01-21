const getConceptText = async (page) => page.$eval('[data-testid="concept-text-0"]', el => {
	const raw = el.textContent ?? '';
	return raw.replace(/\u00a0/g, '').trim();
});

const expectConceptText = async (page, expected, timeout = 10000) => {
	const start = Date.now();
	let last = '';
	while (Date.now() - start < timeout) {
		last = await getConceptText(page);
		if (last === expected) return;
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`Expected concept text to be "${expected}", got "${last}"`);
};

const waitForAnyTopicTitleValue = async (page, text, timeout = 10000) => {
	const start = Date.now();
	let lastValues = [];
	while (Date.now() - start < timeout) {
		lastValues = await page.$$eval('[data-testid^="topic-title-input-"]', els => els.map(el => el.value));
		if (lastValues.some(value => value.includes(text))) return;
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`Expected a topic title to include "${text}", got ${JSON.stringify(lastValues)}`);
};

const runStep = async (label, fn) => {
	const start = Date.now();
	console.log(`E2E Spec: ${label} - start`);
	try {
		await fn();
		const durationMs = Date.now() - start;
		console.log(`E2E Spec: ${label} - pass (${durationMs}ms)`);
	} catch (error) {
		const durationMs = Date.now() - start;
		console.log(`E2E Spec: ${label} - fail (${durationMs}ms)`);
		throw error;
	}
};

const openTopicSwitcher = async (page) => {
	await page.keyboard.press(' ');
	await page.keyboard.press('a');
	await page.waitForSelector('[data-testid="topic-switcher"]', { timeout: 10000 });
};

export async function run({ page, baseUrl }) {
	const url = new URL('/__e2e', baseUrl).toString();
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('[data-testid="concept-text-0"]');
	await page.click('body');

	await runStep('Topics CRUD + menu keybindings', async () => {
		await openTopicSwitcher(page);
		const initialCount = await page.$$eval('[data-testid^="topic-item-"]', els => els.length);
		await page.keyboard.press('o');
		await page.waitForFunction(
			(selector, count) => document.querySelectorAll(selector).length === count + 1,
			{},
			'[data-testid^="topic-item-"]',
			initialCount
		);

		const newTopicId = await page.$$eval('[data-testid^="topic-item-"]', els => {
			const last = els[els.length - 1];
			const id = last?.getAttribute('data-testid') || '';
			return id.replace('topic-item-', '');
		});
		if (!newTopicId) throw new Error('Expected a newly created topic id.');

		const titleInputSelector = `[data-testid="topic-title-input-${newTopicId}"]`;
		await page.keyboard.type('My Topic');
		await page.waitForFunction(
			(selector) => {
				const input = document.querySelector(selector);
				return input && input.value === 'My Topic';
			},
			{},
			titleInputSelector
		);

		await page.keyboard.press('Escape');
		await page.keyboard.press('Enter');
		await page.waitForSelector('[data-testid="topic-switcher"]', { hidden: true, timeout: 10000 });

		const title = await page.$eval('[data-testid="topic-title"]', el => el.textContent?.trim() || '');
		if (title !== 'My Topic') {
			throw new Error(`Expected topic title to be "My Topic", got "${title}"`);
		}

		await openTopicSwitcher(page);
		await page.keyboard.press('o');
		await page.waitForFunction(
			(selector, count) => document.querySelectorAll(selector).length === count + 1,
			{},
			'[data-testid^="topic-item-"]',
			initialCount + 1
		);
		const newlyCreatedId = await page.$$eval('[data-testid^="topic-item-"]', els => {
			const last = els[els.length - 1];
			const id = last?.getAttribute('data-testid') || '';
			return id.replace('topic-item-', '');
		});
		if (!newlyCreatedId) throw new Error('Expected a newly created topic id for rename.');
		await page.waitForSelector(`[data-testid="topic-title-input-${newlyCreatedId}"]`);
		await page.type(`[data-testid="topic-title-input-${newlyCreatedId}"]`, 'Keyboard Topic');
		await page.waitForFunction(
			(selector) => {
				const input = document.querySelector(selector);
				return input && input.value.includes('Keyboard Topic');
			},
			{},
			`[data-testid="topic-title-input-${newlyCreatedId}"]`
		);
		await page.keyboard.press('Escape');
		await page.keyboard.press('k');
		await page.keyboard.press('Enter');
		await page.waitForSelector('[data-testid="topic-switcher"]', { hidden: true, timeout: 10000 });
		await openTopicSwitcher(page);
		const countAfterOpen = await page.$$eval('[data-testid^="topic-item-"]', els => els.length);
		await page.keyboard.press('j');
		await page.keyboard.press('c');
		await page.click('[data-testid^="topic-title-input-"]');
		await page.type('[data-testid^="topic-title-input-"]', ' Renamed');
		await waitForAnyTopicTitleValue(page, 'Renamed');
		await page.click('[data-testid="topic-switcher"]');
		await page.keyboard.press('d');
		await page.waitForFunction(
			(selector, count) => document.querySelectorAll(selector).length === count - 1,
			{},
			'[data-testid^="topic-item-"]',
			countAfterOpen
		);
		await page.keyboard.press('Escape');

		const originalText = await getConceptText(page);
		await page.keyboard.press('i');
		await page.keyboard.press('i');
		await page.keyboard.type('Alpha ');
		await page.keyboard.press('Escape');
		const expectedEdited = originalText === 'Empty...' ? 'Alpha' : `Alpha ${originalText}`;
		await expectConceptText(page, expectedEdited);

		await openTopicSwitcher(page);
		const beforeDeleteCount = await page.$$eval('[data-testid^="topic-item-"]', els => els.length);
		await page.keyboard.press('d');
		await page.waitForFunction(
			(selector, count) => document.querySelectorAll(selector).length === count - 1,
			{},
			'[data-testid^="topic-item-"]',
			beforeDeleteCount
		);
		await page.keyboard.press('Escape');
	});

	await runStep('Topic flow: create, name, enter (keyboard only)', async () => {
		await openTopicSwitcher(page);
		const beforeCount = await page.$$eval('[data-testid^="topic-item-"]', els => els.length);
		await page.keyboard.press('o');
		await page.waitForFunction(
			(selector, count) => document.querySelectorAll(selector).length === count + 1,
			{},
			'[data-testid^="topic-item-"]',
			beforeCount
		);
		const createdId = await page.$$eval('[data-testid^="topic-item-"]', els => {
			const last = els[els.length - 1];
			const id = last?.getAttribute('data-testid') || '';
			return id.replace('topic-item-', '');
		});
		const inputSelector = `[data-testid="topic-title-input-${createdId}"]`;
		await page.type(inputSelector, 'Flow One');
		await page.keyboard.press('Escape');
		await page.keyboard.press('Enter');
		await page.waitForSelector('[data-testid="topic-switcher"]', { hidden: true, timeout: 10000 });
		const title = await page.$eval('[data-testid="topic-title"]', el => el.textContent?.trim() || '');
		if (title !== 'Flow One') {
			throw new Error(`Expected topic title to be "Flow One", got "${title}"`);
		}
	});

	await runStep('Topic flow: create, navigate, open with l', async () => {
		await openTopicSwitcher(page);
		const beforeCount = await page.$$eval('[data-testid^="topic-item-"]', els => els.length);
		await page.keyboard.press('o');
		await page.waitForFunction(
			(selector, count) => document.querySelectorAll(selector).length === count + 1,
			{},
			'[data-testid^="topic-item-"]',
			beforeCount
		);
		const createdId = await page.$$eval('[data-testid^="topic-item-"]', els => {
			const last = els[els.length - 1];
			const id = last?.getAttribute('data-testid') || '';
			return id.replace('topic-item-', '');
		});
		await page.type(`[data-testid="topic-title-input-${createdId}"]`, 'Flow Two');
		await page.keyboard.press('Escape');
		await page.keyboard.press('k');
		await page.keyboard.press('j');
		await page.keyboard.press('l');
		await page.waitForSelector('[data-testid="topic-switcher"]', { hidden: true, timeout: 10000 });
		const title = await page.$eval('[data-testid="topic-title"]', el => el.textContent?.trim() || '');
		if (title !== 'Flow Two') {
			throw new Error(`Expected topic title to be "Flow Two", got "${title}"`);
		}
	});

	await runStep('Topic flow: create, rename with c, enter', async () => {
		await openTopicSwitcher(page);
		const beforeCount = await page.$$eval('[data-testid^="topic-item-"]', els => els.length);
		await page.keyboard.press('o');
		await page.waitForFunction(
			(selector, count) => document.querySelectorAll(selector).length === count + 1,
			{},
			'[data-testid^="topic-item-"]',
			beforeCount
		);
		const createdId = await page.$$eval('[data-testid^="topic-item-"]', els => {
			const last = els[els.length - 1];
			const id = last?.getAttribute('data-testid') || '';
			return id.replace('topic-item-', '');
		});
		await page.type(`[data-testid="topic-title-input-${createdId}"]`, 'Flow Three');
		await page.keyboard.press('Escape');
		await page.keyboard.press('c');
		await page.waitForSelector('[data-selected="true"] [data-testid^="topic-title-input-"]');
		await page.type('[data-selected="true"] [data-testid^="topic-title-input-"]', ' Updated');
		await waitForAnyTopicTitleValue(page, 'Updated');
		await page.keyboard.press('Escape');
		await page.keyboard.press('Enter');
		await page.waitForSelector('[data-testid="topic-switcher"]', { hidden: true, timeout: 10000 });
		const title = await page.$eval('[data-testid="topic-title"]', el => el.textContent?.trim() || '');
		if (!title.includes('Updated')) {
			throw new Error(`Expected topic title to include "Updated", got "${title}"`);
		}
	});

	await runStep('Topic flow: open previous after creating', async () => {
		const previousTitle = await page.$eval('[data-testid="topic-title"]', el => el.textContent?.trim() || '');
		await openTopicSwitcher(page);
		const beforeCount = await page.$$eval('[data-testid^="topic-item-"]', els => els.length);
		await page.keyboard.press('o');
		await page.waitForFunction(
			(selector, count) => document.querySelectorAll(selector).length === count + 1,
			{},
			'[data-testid^="topic-item-"]',
			beforeCount
		);
		const createdId = await page.$$eval('[data-testid^="topic-item-"]', els => {
			const last = els[els.length - 1];
			const id = last?.getAttribute('data-testid') || '';
			return id.replace('topic-item-', '');
		});
		await page.type(`[data-testid="topic-title-input-${createdId}"]`, 'Flow Prev');
		await page.keyboard.press('Escape');
		await page.keyboard.press('Enter');
		await page.waitForSelector('[data-testid="topic-switcher"]', { hidden: true, timeout: 10000 });
		await openTopicSwitcher(page);
		await page.keyboard.press('k');
		await page.keyboard.press('Enter');
		await page.waitForSelector('[data-testid="topic-switcher"]', { hidden: true, timeout: 10000 });
		const title = await page.$eval('[data-testid="topic-title"]', el => el.textContent?.trim() || '');
		if (title !== previousTitle) {
			throw new Error(`Expected to return to previous topic "${previousTitle}", got "${title}"`);
		}
	});
}