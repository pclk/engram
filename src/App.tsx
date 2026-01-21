import { Route, Routes } from 'react-router-dom';
import EngramApp from './engram';
import { Auth } from './pages/auth';
import { Home } from './pages/home';

export default function App() {
	const isE2E = import.meta.env.VITE_E2E === 'true';
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="/auth/*" element={<Auth />} />
			{isE2E && <Route path="/__e2e" element={<EngramApp />} />}
		</Routes>
	);
}
