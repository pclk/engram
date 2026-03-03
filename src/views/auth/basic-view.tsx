'use client';

import { ForgotPasswordForm, MagicLinkForm, SignInForm, SignUpForm } from '@neondatabase/neon-js/auth/react/ui';

type BasicAuthViewPath = 'forgot-password' | 'magic-link' | 'sign-in' | 'sign-up';

export function BasicAuthView({ path }: { path: BasicAuthViewPath }) {
	switch (path) {
		case 'sign-up':
			return <SignUpForm localization={{} as any} />;
		case 'forgot-password':
			return <ForgotPasswordForm localization={{} as any} />;
		case 'magic-link':
			return <MagicLinkForm localization={{} as any} />;
		case 'sign-in':
		default:
			return <SignInForm localization={{} as any} />;
	}
}
