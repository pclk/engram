const waitForText = async (page, text, timeout = 10000) => {
	await page.waitForFunction(
		(targetText) => document.body.innerText.includes(targetText),
		{ timeout },
		text
	);
};

export async function run({ page, baseUrl }) {
	const label = 'Markdown formatting (elaboration derivative)';
	const startTime = Date.now();
	console.log(`E2E Spec: ${label} - start`);
	const url = new URL('/__e2e', baseUrl).toString();
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForText(page, 'BLOCK - CONCEPT');
	await page.waitForSelector('[data-testid="concept-text-0"]');
	await page.click('body');

	const elaborationText = '- item 1\n- item 2\n\n**bold item**, *italicized item*, `coded_item`';
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await page.keyboard.press('l');
	await page.keyboard.press('o');
	await page.keyboard.press('e');
	await page.waitForSelector('textarea');
	await page.click('textarea');
	await page.keyboard.down('Control');
	await page.keyboard.press('A');
	await page.keyboard.up('Control');
	await page.keyboard.press('Backspace');
	await page.keyboard.type(elaborationText);
	const elaborationValue = await page.$eval('textarea', el => el.value ?? '');
	if (!elaborationValue.includes('item 1')) {
		throw new Error('Expected elaboration textarea to include item 1 after input.');
	}
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	const derivativeSelector = '[data-derivative-type="ELABORATION"] [data-testid^="derivative-text-"]';
	await page.waitForSelector(derivativeSelector);

	const markdownMeta = await page.$eval(derivativeSelector, el => ({
		listItems: el.querySelectorAll('ul li').length,
		bold: !!el.querySelector('strong'),
		italic: !!el.querySelector('em'),
		code: !!el.querySelector('code'),
		html: el.innerHTML
	}));
	if (markdownMeta.listItems < 2) {
		throw new Error(`Expected elaboration to render list items as <li>. HTML: ${markdownMeta.html}`);
	}
	if (!markdownMeta.bold || !markdownMeta.italic || !markdownMeta.code) {
		throw new Error(`Expected elaboration to render bold, italic, and code markdown. HTML: ${markdownMeta.html}`);
	}

	const durationMs = Date.now() - startTime;
	console.log(`E2E Spec: ${label} - pass (${durationMs}ms)`);
}
