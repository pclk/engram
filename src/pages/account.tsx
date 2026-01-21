import { AccountView } from '@neondatabase/neon-js/auth/react/ui';
import { useLocation } from 'react-router-dom';

export function Account() {
	const location = useLocation();
	const rawPath = location.pathname.replace(/^\/account\/?/, '');
	const viewPath = rawPath ? rawPath.split('/')[0] : 'settings';
	return (
		<div className="neon-auth-page">
			<div className="neon-auth-card">
				<div className="neon-auth-brand">
					<img className="neon-auth-brand-badge" src="/logo.svg" alt="Engram" />
					<div>
						<h1>Engram</h1>
						<p>Manage your account settings</p>
					</div>
				</div>
				<AccountView path={viewPath} className="neon-auth-root" />
			</div>
		</div>
	);
}
