'use client';

import { Suspense, lazy } from 'react';
import { usePathname } from 'next/navigation';

import { BasicAuthView } from './basic-view';

const AdvancedAuthView = lazy(() => import('./advanced-view').then(module => ({ default: module.AdvancedAuthView })));
const FullAuthView = lazy(() =>
	import('@neondatabase/neon-js/auth/react/ui').then(module => ({
		default: ({ path }: { path: string }) => <module.AuthView path={path} className="neon-auth-root" />
	}))
);

export function AuthViewPage() {
	const pathname = usePathname();
	const rawPath = pathname.replace(/^\/auth\/?/, '');
	const normalized = rawPath || 'sign-in';
	let viewPath = normalized.split('/')[0];

	if (normalized.includes('email-otp')) viewPath = 'email-otp';
	else if (normalized.includes('magic-link')) viewPath = 'magic-link';
	else if (normalized.includes('two-factor')) viewPath = 'two-factor';
	else if (normalized.includes('recover-account')) viewPath = 'recover-account';
	else if (normalized.includes('reset-password')) viewPath = 'reset-password';
	else if (normalized.includes('forgot-password')) viewPath = 'forgot-password';
	else if (normalized.includes('callback')) viewPath = 'callback';
	else if (normalized.includes('sign-out')) viewPath = 'sign-out';
	else if (normalized.includes('sign-up')) viewPath = 'sign-up';
	else if (normalized.includes('sign-in')) viewPath = 'sign-in';

	const isBasicView = ['sign-in', 'sign-up', 'forgot-password', 'magic-link'].includes(viewPath);
	const isAdvancedView = ['callback', 'recover-account', 'reset-password', 'sign-out', 'two-factor'].includes(viewPath);

	return (
		<div className="neon-auth-page">
			<div className="neon-auth-card">
				<div className="neon-auth-brand">
					<img className="neon-auth-brand-badge" src="/logo.svg" alt="Engram" />
					<div>
						<h1>Engram</h1>
						<p>Sign in to your knowledge workspace</p>
					</div>
				</div>
				<div className="neon-auth-root">
					{isBasicView ? (
						<BasicAuthView path={viewPath as 'forgot-password' | 'magic-link' | 'sign-in' | 'sign-up'} />
					) : (
						<Suspense fallback={<div>Loading...</div>}>
							{isAdvancedView ? (
								<AdvancedAuthView path={viewPath as 'callback' | 'recover-account' | 'reset-password' | 'sign-out' | 'two-factor'} />
							) : (
								<FullAuthView path={viewPath} />
							)}
						</Suspense>
					)}
				</div>
				<div className="neon-auth-links">
					<a href="/auth/sign-in">Sign in</a>
					<span>•</span>
					<a href="/auth/sign-up">Create account</a>
					<span>•</span>
					<a href="/auth/forgot-password">Forgot password</a>
				</div>
			</div>
		</div>
	);
}
