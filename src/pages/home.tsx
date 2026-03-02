import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import EngramApp from '../engram';
import { authClient } from '../lib/auth-client';

export function Home() {
	const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

	useEffect(() => {
		let mounted = true;
		authClient
			.getSession()
			.then(({ data }) => {
				if (mounted) {
					setIsSignedIn(Boolean(data?.session));
				}
			})
			.catch(() => {
				if (mounted) {
					setIsSignedIn(false);
				}
			});

		return () => {
			mounted = false;
		};
	}, []);

	if (isSignedIn === null) {
		return <div>Loading...</div>;
	}

	if (!isSignedIn) {
		return <Navigate to="/auth/sign-in" replace />;
	}

	return (
		<div style={{ position: 'relative', minHeight: '100vh' }}>
			<EngramApp />
		</div>
	);
}
