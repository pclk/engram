import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const EngramApp = lazy(() => import('./engram'));
const AuthShell = lazy(() => import('./pages/auth/shell').then(module => ({ default: module.AuthShell })));
const Home = lazy(() => import('./pages/home').then(module => ({ default: module.Home })));

const RouteFallback = () => <div>Loading...</div>;

export default function App() {
	const isE2E = import.meta.env.VITE_E2E === 'true';

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
