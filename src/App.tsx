import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const EngramApp = lazy(() => import('./engram'));
<<<<<<< codex/optimize-lazy-loading-for-auth-routes
const AuthShell = lazy(() => import('./pages/auth/shell').then(module => ({ default: module.AuthShell })));
const Home = lazy(() => import('./pages/home').then(module => ({ default: module.Home })));

const RouteFallback = () => <div>Loading...</div>;
=======
const Home = lazy(() => import('./pages/home').then(module => ({ default: module.Home })));

const AuthShell = lazy(() => import('./pages/auth/shell').then(module => ({ default: module.AuthShell })));
>>>>>>> main

export default function App() {
	const isE2E = import.meta.env.VITE_E2E === 'true';

	return (
<<<<<<< codex/optimize-lazy-loading-for-auth-routes
		<Suspense fallback={<RouteFallback />}>
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/guest" element={<EngramApp guestMode />} />
				<Route path="/auth/*" element={<AuthShell />} />
				{isE2E && <Route path="/__e2e" element={<EngramApp />} />}
			</Routes>
		</Suspense>
=======
		<Routes>
			<Route
				path="/"
				element={
					<Suspense fallback={<div>Loading...</div>}>
						<Home />
					</Suspense>
				}
			/>
			<Route
				path="/guest"
				element={
					<Suspense fallback={<div>Loading...</div>}>
						<EngramApp guestMode />
					</Suspense>
				}
			/>
			<Route
				path="/auth/*"
				element={
					<Suspense fallback={<div>Loading...</div>}>
						<AuthShell />
					</Suspense>
				}
			/>
			{isE2E && (
				<Route
					path="/__e2e"
					element={
						<Suspense fallback={<div>Loading...</div>}>
							<EngramApp />
						</Suspense>
					}
				/>
			)}
		</Routes>
>>>>>>> main
	);
}
