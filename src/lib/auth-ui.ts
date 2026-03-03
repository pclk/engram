'use client';

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

export const navigate = (href: string) => {
	const currentPath = window.location.pathname;
	const target = getHrefInfo(href);
	if (currentPath.startsWith('/auth/sign-up') && target.pathname.startsWith('/auth/sign-in')) {
		window.location.href = `${AUTH_VERIFY_PATH}${window.location.search}`;
		return;
	}
	window.location.href = target.href;
};

export const replace = (href: string) => {
	const target = getHrefInfo(href);
	window.location.replace(target.href);
};

export const toast = ({ variant = 'default', message }: { variant?: string; message?: string }) => {
	const msg = typeof message === 'string' ? message : String(message ?? '');
	if (variant === 'error' && msg.toLowerCase().includes('email not verified')) {
		setTimeout(() => {
			window.location.href = `${AUTH_VERIFY_PATH}${window.location.search}`;
		}, 150);
	}
	if (variant === 'default' || typeof (sonnerToast as unknown as Record<string, unknown>)[variant] !== 'function') sonnerToast(msg);
	else (sonnerToast as unknown as Record<string, (value: string) => void>)[variant](msg);
};
