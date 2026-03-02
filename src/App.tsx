import { Suspense, lazy } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { neonConfigDiagnostics } from './lib/auth';

const EngramApp = lazy(() => import('./engram'));
const Home = lazy(() => import('./pages/home').then(module => ({ default: module.Home })));
const AuthShell = lazy(() => import('./pages/auth/shell').then(module => ({ default: module.AuthShell })));

const RouteFallback = () => <div>Loading...</div>;

const MissingConfigPanel = () => (
	<div style={{ maxWidth: 760, margin: '3rem auto', padding: '1.25rem', border: '1px solid #f59e0b', borderRadius: 12, background: '#fffbeb' }}>
		<h2 style={{ marginTop: 0 }}>Auth configuration is missing</h2>
		<p>
			This build is missing required Neon variables for authenticated mode.
		</p>
		<ul>
			{neonConfigDiagnostics.missingKeys.map(key => (
				<li key={key}><code>{key}</code></li>
			))}
		</ul>
		<p>
			Set these in <code>.env.local</code> and restart the dev server, or continue in <Link to="/guest">Guest mode</Link>.
		</p>
	</div>
);

export default function App() {
	const isE2E = import.meta.env.VITE_E2E === 'true';
	const location = useLocation();
	const isGuestRoute = location.pathname.startsWith('/guest');
	const isAuthConfigured = neonConfigDiagnostics.isConfigured;

	if (!isAuthConfigured && !isGuestRoute) {
		return <MissingConfigPanel />;
	}

	return (
		<Suspense fallback={<RouteFallback />}>
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/guest" element={<EngramApp guestMode />} />
				<Route path="/auth/*" element={<AuthShell />} />
				{isE2E && <Route path="/__e2e" element={<EngramApp />} />}
			</Routes>
		</Suspense>
	);
}
