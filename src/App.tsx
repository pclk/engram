import { Route, Routes } from 'react-router-dom';
import { Auth } from './pages/auth';
import { Home } from './pages/home';

export default function App() {
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="/auth/*" element={<Auth />} />
		</Routes>
	);
}
