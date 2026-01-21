export async function run({ page, baseUrl }) {
	const startTime = Date.now();
	const label = 'Auth page renders';
	console.log(`E2E Spec: ${label} - start`);
	const url = new URL('/auth/sign-in', baseUrl).toString();
	await page.goto(url, { waitUntil: 'domcontentloaded' });

	await page.waitForSelector('h1', { timeout: 10000 });
	const heading = await page.$eval('h1', element => element.textContent?.trim());
	if (heading !== 'Engram') {
		throw new Error(`Expected heading "Engram", got "${heading}"`);
	}

	await page.waitForSelector('a[href="/auth/sign-in"]', { timeout: 10000 });
	await page.waitForSelector('a[href="/auth/sign-up"]', { timeout: 10000 });
	await page.waitForSelector('a[href="/auth/forgot-password"]', { timeout: 10000 });
	const durationMs = Date.now() - startTime;
	console.log(`E2E Spec: ${label} - pass (${durationMs}ms)`);
}