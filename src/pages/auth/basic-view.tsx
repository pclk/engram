import { ForgotPasswordForm, MagicLinkForm, SignInForm, SignUpForm } from '@neondatabase/neon-js/auth/react/ui';

type BasicAuthViewPath = 'forgot-password' | 'magic-link' | 'sign-in' | 'sign-up';

export function BasicAuthView({ path }: { path: BasicAuthViewPath }) {
	switch (path) {
		case 'sign-up':
			return <SignUpForm />;
		case 'forgot-password':
			return <ForgotPasswordForm />;
		case 'magic-link':
			return <MagicLinkForm />;
		case 'sign-in':
		default:
			return <SignInForm />;
	}
}
