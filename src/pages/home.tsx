import { RedirectToSignIn, SignedIn, SignedOut } from '@neondatabase/neon-js/auth/react/ui';

import EngramApp from '../engram';

export function Home() {
	return (
		<>
			<SignedIn>
				<div style={{ position: 'relative', minHeight: '100vh' }}>
					<EngramApp />
				</div>
			</SignedIn>
			<SignedOut>
				<RedirectToSignIn />
			</SignedOut>
		</>
	);
}
