import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react/ui';
import '@neondatabase/neon-js/ui/css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './auth-theme.css';
import './engram-markdown.css';
import App from './App';
import { authClient } from './lib/auth-client';
import { navigate, replace, toast } from './lib/auth-ui';

const root = createRoot(document.getElementById('root')!);
root.render(
	<React.StrictMode>
		<BrowserRouter>
			<NeonAuthUIProvider
				authClient={authClient}
				redirectTo="/"
				navigate={navigate}
				replace={replace}
				toast={toast}
				emailOTP
				emailVerification
			>
				<App />
			</NeonAuthUIProvider>
		</BrowserRouter>
	</React.StrictMode>
);
