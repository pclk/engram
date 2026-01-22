import { AuthView } from '@neondatabase/neon-js/auth/react/ui';
import { useLocation } from 'react-router-dom';

export function Auth() {
	const location = useLocation();
	const rawPath = location.pathname.replace(/^\/auth\/?/, '');
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
				<AuthView path={viewPath} className="neon-auth-root" />
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
