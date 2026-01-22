import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';
import puppeteer from 'puppeteer';
import { run as runAuthSpec } from './e2e/auth.spec.mjs';
import { run as runKeybindingsSpec } from './e2e/keybindings.spec.mjs';
import { run as runMarkdownSpec } from './e2e/markdown.spec.mjs';
import { run as runNormalPerformanceSpec } from './e2e/normal-performance.spec.mjs';
import { run as runScrollSpec } from './e2e/scroll.spec.mjs';
import { run as runTopicsSpec } from './e2e/topics.spec.mjs';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;
const SERVER_TIMEOUT_MS = 30000;

const waitForServer = async (url, timeoutMs) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url, { method: 'GET' });
			if (response.ok) return;
		} catch {
			// ignore and retry
		}
		await delay(500);
	}
	throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
};

const isPortAvailable = (port) => new Promise(resolve => {
	const server = net.createServer();
	server.once('error', () => resolve(false));
	server.once('listening', () => server.close(() => resolve(true)));
	server.listen(port, HOST);
});

const findAvailablePort = async (startPort, attempts = 10) => {
	for (let i = 0; i < attempts; i++) {
		const port = startPort + i;
		if (await isPortAvailable(port)) return port;
	}
	throw new Error(`No available port found starting at ${startPort}`);
};

const startServer = (port) => {
	const args = ['run', 'dev', '--', '--host', HOST, '--port', String(port), '--strictPort'];
	const proc = spawn('npm', args, {
		stdio: 'inherit',
		env: { ...process.env, BROWSER: 'none', VITE_E2E: 'true' }
	});
	return proc;
};

const stopServer = async (proc) => {
	if (proc.exitCode !== null) return;
	proc.kill('SIGTERM');
	await new Promise(resolve => proc.once('exit', resolve));
};

const runTests = async () => {
	const port = process.env.E2E_PORT
		? Number(process.env.E2E_PORT)
		: await findAvailablePort(DEFAULT_PORT);
	const baseUrl = process.env.E2E_BASE_URL || `http://${HOST}:${port}`;

	const serverProcess = startServer(port);
	let browser;
	try {
		await waitForServer(baseUrl, SERVER_TIMEOUT_MS);

		browser = await puppeteer.launch({ headless: 'new' });
		const page = await browser.newPage();
		page.setDefaultTimeout(10000);

		console.log('E2E: auth spec start');
		await runAuthSpec({ page, baseUrl });
		console.log('E2E: auth spec passed');

		console.log('E2E: keybindings spec start');
		await runKeybindingsSpec({ page, baseUrl });
		console.log('E2E: keybindings spec passed');

		console.log('E2E: markdown spec start');
		await runMarkdownSpec({ page, baseUrl });
		console.log('E2E: markdown spec passed');

		console.log('E2E: normal performance spec start');
		await runNormalPerformanceSpec({ page, baseUrl });
		console.log('E2E: normal performance spec passed');

		console.log('E2E: scroll spec start');
		await runScrollSpec({ page, baseUrl });
		console.log('E2E: scroll spec passed');

		console.log('E2E: topics spec start');
		await runTopicsSpec({ page, baseUrl });
		console.log('E2E: topics spec passed');

		await browser.close();
		browser = undefined;
		await stopServer(serverProcess);
	} catch (error) {
		if (browser) {
			await browser.close();
		}
		await stopServer(serverProcess);
		throw error;
	}
};

await runTests();