import { describe, expect, it } from 'vitest';
import { resolveAccountSection } from '@/src/views/account-sections';

describe('resolveAccountSection', () => {
	it('defaults to settings when no slug is provided', () => {
		expect(resolveAccountSection()).toBe('settings');
		expect(resolveAccountSection([])).toBe('settings');
	});

	it('accepts known single-segment sections', () => {
		expect(resolveAccountSection(['profile'])).toBe('profile');
		expect(resolveAccountSection(['security'])).toBe('security');
		expect(resolveAccountSection(['settings'])).toBe('settings');
	});

	it('rejects unknown or nested sections', () => {
		expect(resolveAccountSection(['unknown'])).toBeNull();
		expect(resolveAccountSection(['profile', 'advanced'])).toBeNull();
	});
});
