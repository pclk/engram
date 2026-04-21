export const accountSections = ['settings', 'profile', 'security'] as const;

export type AccountSection = (typeof accountSections)[number];

export const accountSectionMeta: Record<
	AccountSection,
	{ label: string; description: string; href: string }
> = {
	settings: {
		label: 'Overview',
		description: 'Quick summary, security state, and navigation.',
		href: '/account'
	},
	profile: {
		label: 'Profile',
		description: 'Update your name, email, and avatar.',
		href: '/account/profile'
	},
	security: {
		label: 'Security',
		description: 'Change your password and manage your session.',
		href: '/account/security'
	}
};

const accountSectionSet = new Set<string>(accountSections);

export const resolveAccountSection = (slug?: string[]): AccountSection | null => {
	if (!slug || slug.length === 0) return 'settings';
	if (slug.length !== 1) return null;
	return accountSectionSet.has(slug[0]) ? (slug[0] as AccountSection) : null;
};
