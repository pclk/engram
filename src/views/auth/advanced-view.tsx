'use client';

import { AuthCallback, RecoverAccountForm, ResetPasswordForm, SignOut, TwoFactorForm } from '@neondatabase/neon-js/auth/react/ui';

type AdvancedAuthViewPath = 'callback' | 'recover-account' | 'reset-password' | 'sign-out' | 'two-factor';

export function AdvancedAuthView({ path }: { path: AdvancedAuthViewPath }) {
	switch (path) {
		case 'callback':
			return <AuthCallback />;
		case 'recover-account':
			return <RecoverAccountForm localization={{} as any} />;
		case 'reset-password':
			return <ResetPasswordForm localization={{} as any} />;
		case 'sign-out':
			return <SignOut />;
		case 'two-factor':
		default:
			return <TwoFactorForm localization={{} as any} />;
	}
}
