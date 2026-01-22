const waitForText = async (page, text, timeout = 10000) => {
	await page.waitForFunction(
		(targetText) => document.body.innerText.includes(targetText),
		{ timeout },
		text
	);
};

const getMarkdownMeta = async (page, selector) => page.$eval(selector, el => ({
	listItems: el.querySelectorAll('ul li').length,
	bold: !!el.querySelector('strong'),
	italic: !!el.querySelector('em'),
	code: !!el.querySelector('code'),
	html: el.innerHTML
}));

const expectMarkdownMeta = (meta, label) => {
	if (meta.listItems < 2) {
		throw new Error(`Expected ${label} to render list items as <li>. HTML: ${meta.html}`);
	}
	if (!meta.bold || !meta.italic || !meta.code) {
		throw new Error(`Expected ${label} to render bold, italic, and code markdown. HTML: ${meta.html}`);
	}
};

export async function run({ page, baseUrl }) {
	const label = 'Markdown formatting (all blocks)';
	const startTime = Date.now();
	console.log(`E2E Spec: ${label} - start`);
	const url = new URL('/__e2e', baseUrl).toString();
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForText(page, 'BLOCK - CONCEPT');
	await page.waitForSelector('[data-testid="concept-text-0"]');
	await page.click('body');

	const conceptText = '- concept item 1\n- concept item 2\n\n**bold concept**, *italic concept*, `concept_code`';
	const elaborationText = '- item 1\n- item 2\n\n**bold item**, *italicized item*, `coded_item`';
	const probingText = '- probe 1\n- probe 2\n\n**bold probe**, *italic probe*, `probe_code`';
	const clozeText = '- cloze 1\n- cloze 2\n\n**bold cloze**, *italic cloze*, `cloze_code`';

	await page.keyboard.press('i');
	await waitForText(page, 'NORMAL');
	await page.keyboard.press('i');
	await page.waitForSelector('textarea');
	await page.click('textarea');
	await page.keyboard.down('Control');
	await page.keyboard.press('A');
	await page.keyboard.up('Control');
	await page.keyboard.press('Backspace');
	await page.keyboard.type(conceptText);
	await page.keyboard.press('Escape');
	await waitForText(page, 'NORMAL');
	await page.keyboard.press('Escape');
	await waitForText(page, 'BLOCK - CONCEPT');

	const conceptSelector = '[data-testid="concept-text-0"]';
	await page.waitForSelector(conceptSelector);
	const conceptMeta = await getMarkdownMeta(page, conceptSelector);
	expectMarkdownMeta(conceptMeta, 'concept');
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
	const elaborationSelector = '[data-derivative-type="ELABORATION"] [data-testid^="derivative-text-"]';
	await page.waitForSelector(elaborationSelector);
	const elaborationMeta = await getMarkdownMeta(page, elaborationSelector);
	expectMarkdownMeta(elaborationMeta, 'elaboration');

	await page.keyboard.press('o');
	await page.keyboard.press('p');
	await page.waitForSelector('textarea');
	await page.click('textarea');
	await page.keyboard.down('Control');
	await page.keyboard.press('A');
	await page.keyboard.up('Control');
	await page.keyboard.press('Backspace');
	await page.keyboard.type(probingText);
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	const probingSelector = '[data-derivative-type="PROBING"] [data-testid^="derivative-text-"]';
	await page.waitForSelector(probingSelector);
	const probingMeta = await getMarkdownMeta(page, probingSelector);
	expectMarkdownMeta(probingMeta, 'probing');

	await page.keyboard.press('o');
	await page.keyboard.press('c');
	await page.waitForSelector('textarea');
	await page.click('textarea');
	await page.keyboard.down('Control');
	await page.keyboard.press('A');
	await page.keyboard.up('Control');
	await page.keyboard.press('Backspace');
	await page.keyboard.type(clozeText);
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	const clozeSelector = '[data-derivative-type="CLOZE"] [data-testid^="derivative-text-"]';
	await page.waitForSelector(clozeSelector);
	const clozeMeta = await getMarkdownMeta(page, clozeSelector);
	expectMarkdownMeta(clozeMeta, 'cloze');

	const durationMs = Date.now() - startTime;
	console.log(`E2E Spec: ${label} - pass (${durationMs}ms)`);
}
