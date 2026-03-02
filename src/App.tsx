import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const EngramApp = lazy(() => import('./engram'));
const Auth = lazy(() => import('./pages/auth').then(module => ({ default: module.Auth })));
const Home = lazy(() => import('./pages/home').then(module => ({ default: module.Home })));

export default function App() {
	const isE2E = import.meta.env.VITE_E2E === 'true';
	return (
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
						<Auth />
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
	);
}
