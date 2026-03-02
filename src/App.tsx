import { Suspense, lazy } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { neonConfigDiagnostics } from './lib/auth';

const EngramApp = lazy(() => import('./engram'));
const Home = lazy(() => import('./pages/home').then(module => ({ default: module.Home })));
const AuthShell = lazy(() => import('./pages/auth/shell').then(module => ({ default: module.AuthShell })));

const RouteFallback = () => <div>Loading...</div>;

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
