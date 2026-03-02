import { AuthCallback, RecoverAccountForm, ResetPasswordForm, SignOut, TwoFactorForm } from '@neondatabase/neon-js/auth/react/ui';

type AdvancedAuthViewPath = 'callback' | 'recover-account' | 'reset-password' | 'sign-out' | 'two-factor';

export function AdvancedAuthView({ path }: { path: AdvancedAuthViewPath }) {
	switch (path) {
		case 'callback':
			return <AuthCallback />;
		case 'recover-account':
			return <RecoverAccountForm />;
		case 'reset-password':
			return <ResetPasswordForm />;
		case 'sign-out':
			return <SignOut />;
		case 'two-factor':
		default:
			return <TwoFactorForm />;
	}
}
