import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import EngramApp from './engram';
import { Home } from './pages/home';

const AuthShell = lazy(async () => {
	const mod = await import('./pages/auth/shell');
	return { default: mod.AuthShell };
});

export default function App() {
	const isE2E = import.meta.env.VITE_E2E === 'true';
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="/guest" element={<EngramApp guestMode />} />
			<Route
				path="/auth/*"
				element={
					<Suspense fallback={null}>
						<AuthShell />
					</Suspense>
				}
			/>
			{isE2E && <Route path="/__e2e" element={<EngramApp />} />}
		</Routes>
	);
}
