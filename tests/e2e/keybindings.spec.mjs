const waitForText = async (page, text, timeout = 10000) => {
	await page.waitForFunction(
		(targetText) => document.body.innerText.includes(targetText),
		{ timeout },
		text
	);
};

const waitForNoText = async (page, text, timeout = 10000) => {
	await page.waitForFunction(
		(targetText) => !document.body.innerText.includes(targetText),
		{ timeout },
		text
	);
};

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

const isWordChar = (char) => /[a-zA-Z0-9_]/.test(char);

const findNextWord = (text, idx) => {
	if (idx >= text.length) return text.length;
	let i = idx;
	if (isWordChar(text[i])) {
		while (i < text.length && isWordChar(text[i])) i++;
	}
	while (i < text.length && !isWordChar(text[i])) i++;
	return i;
};

const findPrevWord = (text, idx) => {
	if (idx <= 0) return 0;
	let i = idx - 1;
	while (i > 0 && !isWordChar(text[i])) i--;
	while (i > 0 && isWordChar(text[i - 1])) i--;
	return i;
};

const findEndWord = (text, idx) => {
	if (!text.length) return 0;
	let i = Math.min(idx, text.length - 1);
	const atEndOfWord = isWordChar(text[i]) && (i === text.length - 1 || !isWordChar(text[i + 1]));
	if (!isWordChar(text[i]) || atEndOfWord) {
		i++;
		while (i < text.length && !isWordChar(text[i])) i++;
		if (i >= text.length) return text.length - 1;
	}
	while (i < text.length - 1 && isWordChar(text[i + 1])) i++;
	return i;
};

export async function run({ page, baseUrl }) {
	const startTime = Date.now();
	const label = 'Keybindings (modes, edit, yank, undo/redo)';
	console.log(`E2E Spec: ${label} - start`);
	const url = new URL('/__e2e', baseUrl).toString();
	await page.goto(url, { waitUntil: 'domcontentloaded' });

	await waitForText(page, 'BLOCK - CONCEPT');
	await page.waitForSelector('[data-testid="concept-text-0"]');
	await page.click('body');

	const originalText = await getConceptText(page);
	if (!originalText) {
		throw new Error('Expected initial concept text to be present.');
	}

	await page.keyboard.press('v');
	await waitForText(page, 'VISUAL');
	await page.keyboard.press('Escape');
	await waitForText(page, 'BLOCK - CONCEPT');

	await page.keyboard.press('i');
	await waitForText(page, 'NORMAL');

	await page.keyboard.press('i');
	await page.keyboard.type('Test ');
	await page.keyboard.press('Escape');
	await waitForText(page, 'NORMAL');
	const expectedInsert = `Test ${originalText}`;
	await expectConceptText(page, expectedInsert);
	let textAfterInsert = await getConceptText(page);
	if (textAfterInsert !== expectedInsert) {
		throw new Error(`Insert mode edit did not apply as expected. Got: "${textAfterInsert}"`);
	}

	await page.keyboard.press('u');
	await expectConceptText(page, originalText);
	let textAfterUndo = await getConceptText(page);
	if (textAfterUndo !== originalText) {
		throw new Error(`Undo did not revert the insert change. Got: "${textAfterUndo}"`);
	}

	await page.keyboard.press('r');
	await expectConceptText(page, expectedInsert);
	textAfterInsert = await getConceptText(page);
	if (textAfterInsert !== expectedInsert) {
		throw new Error(`Redo did not re-apply the insert change. Got: "${textAfterInsert}"`);
	}

	await page.keyboard.press('0');
	await page.keyboard.press('d');
	await page.keyboard.press('w');
	await expectConceptText(page, originalText);
	const textAfterDelete = await getConceptText(page);
	if (textAfterDelete !== originalText) {
		throw new Error(`Delete word (dw) did not remove the first word as expected. Got: "${textAfterDelete}"`);
	}

	await page.keyboard.press('0');
	await page.keyboard.press('x');
	const expectedX = originalText.slice(1);
	await expectConceptText(page, expectedX);
	const textAfterX = await getConceptText(page);
	if (textAfterX !== expectedX) {
		throw new Error(`Delete char (x) did not remove the first character as expected. Got: "${textAfterX}"`);
	}
	await page.keyboard.press('u');
	await expectConceptText(page, originalText);

	await page.keyboard.press('0');
	await page.keyboard.press('c');
	await page.keyboard.press('w');
	await page.keyboard.type('Energy ');
	await page.keyboard.press('Escape');
	const afterFirstWordRemoved = originalText.replace(/^\S+\s+/, '');
	const expectedChange = `Energy ${afterFirstWordRemoved}`;
	await expectConceptText(page, expectedChange);
	const textAfterChange = await getConceptText(page);
	if (textAfterChange !== expectedChange) {
		throw new Error(`Change word (cw) did not update the text as expected. Got: "${textAfterChange}"`);
	}

	await page.keyboard.press('u');
	await expectConceptText(page, originalText);
	const textAfterChangeUndo = await getConceptText(page);
	if (textAfterChangeUndo !== originalText) {
		throw new Error(`Undo did not revert the change word edit. Got: "${textAfterChangeUndo}"`);
	}

	await page.keyboard.press('r');
	await expectConceptText(page, expectedChange);
	const textAfterChangeRedo = await getConceptText(page);
	if (textAfterChangeRedo !== expectedChange) {
		throw new Error(`Redo did not re-apply the change word edit. Got: "${textAfterChangeRedo}"`);
	}

	await page.keyboard.press('u');
	await expectConceptText(page, originalText);

	let currentText = originalText;
	let cursor = 0;

	await page.keyboard.press('0');
	cursor = 0;
	await page.keyboard.press('w');
	cursor = findNextWord(currentText, cursor);
	await page.keyboard.press('y');
	await page.keyboard.press('w');
	const yankWEnd = findNextWord(currentText, cursor);
	const yankWText = currentText.slice(cursor, yankWEnd);
	await page.keyboard.press('p');
	const expectedYw = currentText.slice(0, cursor) + yankWText + currentText.slice(cursor);
	await expectConceptText(page, expectedYw);
	await page.keyboard.press('u');
	await expectConceptText(page, originalText);
	currentText = originalText;

	await page.keyboard.press('0');
	cursor = 0;
	await page.keyboard.press('w');
	cursor = findNextWord(currentText, cursor);
	await page.keyboard.press('y');
	await page.keyboard.press('e');
	const yankEEnd = Math.min(currentText.length, findEndWord(currentText, cursor) + 1);
	const yankEText = currentText.slice(cursor, yankEEnd);
	await page.keyboard.press('p');
	const expectedYe = currentText.slice(0, cursor) + yankEText + currentText.slice(cursor);
	await expectConceptText(page, expectedYe);
	await page.keyboard.press('u');
	await expectConceptText(page, originalText);
	currentText = originalText;

	await page.keyboard.press('0');
	cursor = 0;
	await page.keyboard.press('w');
	cursor = findNextWord(currentText, cursor);
	await page.keyboard.press('y');
	await page.keyboard.press('b');
	const yankBStart = findPrevWord(currentText, cursor);
	const yankBText = currentText.slice(yankBStart, cursor);
	await page.keyboard.press('p');
	const expectedYb = currentText.slice(0, cursor) + yankBText + currentText.slice(cursor);
	await expectConceptText(page, expectedYb);
	await page.keyboard.press('u');
	await expectConceptText(page, originalText);
	currentText = originalText;

	await page.keyboard.press('0');
	await page.keyboard.press('y');
	await page.keyboard.press('y');
	await page.keyboard.press('p');
	const expectedYy = currentText + currentText;
	await expectConceptText(page, expectedYy);
	await page.keyboard.press('u');
	await expectConceptText(page, originalText);

	await page.keyboard.press(' ');
	await waitForText(page, 'CHORD:');
	await page.keyboard.press('Escape');
	await waitForNoText(page, 'CHORD:');

	await page.keyboard.press('/');
	await page.waitForSelector('input[placeholder="Search..."]', { timeout: 10000 });
	await page.keyboard.press('Escape');
	await page.waitForSelector('input[placeholder="Search..."]', { hidden: true, timeout: 10000 });

	await page.keyboard.press('Escape');
	await waitForText(page, 'BLOCK - CONCEPT');
	const durationMs = Date.now() - startTime;
	console.log(`E2E Spec: ${label} - pass (${durationMs}ms)`);
}