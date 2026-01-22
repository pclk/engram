import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react/ui';
import '@neondatabase/neon-js/ui/css';
import './auth-theme.css';
import './engram-markdown.css';
import App from './App';
import { authClient } from './lib/auth';
import { toast as sonnerToast } from 'sonner';

const AUTH_VERIFY_PATH = '/auth/email-otp/verify-email';

const getHrefInfo = (href: string) => {
	try {
		const url = new URL(href, window.location.origin);
		return {
			pathname: url.pathname,
			search: url.search,
			hash: url.hash,
			href: `${url.pathname}${url.search}${url.hash}`
		};
	} catch {
		return {
			pathname: href,
			search: '',
			hash: '',
			href
		};
	}
};

const navigate = (href: string) => {
	const currentPath = window.location.pathname;
	const target = getHrefInfo(href);
	if (currentPath.startsWith('/auth/sign-up') && target.pathname.startsWith('/auth/sign-in')) {
		window.location.href = `${AUTH_VERIFY_PATH}${window.location.search}`;
		return;
	}
	window.location.href = target.href;
};

const replace = (href: string) => {
	const target = getHrefInfo(href);
	window.location.replace(target.href);
};

const toast = ({ variant = 'default', message }: { variant?: 'default' | 'error' | 'success'; message: string }) => {
	const msg = typeof message === 'string' ? message : String(message);
	if (variant === 'error' && msg.toLowerCase().includes('email not verified')) {
		setTimeout(() => {
			window.location.href = `${AUTH_VERIFY_PATH}${window.location.search}`;
		}, 150);
	}
	if (variant === 'default') sonnerToast(msg);
	else sonnerToast[variant](msg);
};

const root = createRoot(document.getElementById('root')!);
root.render(
	<React.StrictMode>
		<NeonAuthUIProvider
			authClient={authClient}
			redirectTo="/"
			navigate={navigate}
			replace={replace}
			toast={toast}
			emailOTP
			emailVerification
		>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</NeonAuthUIProvider>
	</React.StrictMode>
);