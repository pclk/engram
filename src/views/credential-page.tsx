import Link from 'next/link';

type CredentialPageProps = {
	mode: 'login' | 'register';
	action: (formData: FormData) => Promise<void>;
	error?: string | null;
	defaultName?: string;
	defaultEmail?: string;
};

export function CredentialPage({ mode, action, error, defaultName = '', defaultEmail = '' }: CredentialPageProps) {
	const isRegister = mode === 'register';

	return (
		<main className="neon-auth-page">
			<section className="neon-auth-card">
				<div className="neon-auth-panel">
					<h2>{isRegister ? 'Create account' : 'Log in'}</h2>
					<form className="neon-auth-form" action={action}>
						{isRegister && (
							<label className="neon-auth-field">
								<span>Name</span>
								<input name="name" defaultValue={defaultName} autoComplete="name" required />
							</label>
						)}
						<label className="neon-auth-field">
							<span>Email</span>
							<input name="email" type="email" defaultValue={defaultEmail} autoComplete="email" required />
						</label>
						<label className="neon-auth-field">
							<span>Password</span>
							<input
								name="password"
								type="password"
								autoComplete={isRegister ? 'new-password' : 'current-password'}
								minLength={8}
								required
							/>
						</label>
						<button className="neon-auth-button" type="submit">
							{isRegister ? 'Create account' : 'Log in'}
						</button>
					</form>
					{error ? <p className="neon-auth-status neon-auth-status--error">{error}</p> : null}
					<p className="neon-auth-note">
						{isRegister ? 'Already have an account?' : 'Need an account?'}{' '}
						<Link href={isRegister ? '/login' : '/register'}>{isRegister ? 'Log in' : 'Register'}</Link>
					</p>
				</div>
			</section>
		</main>
	);
}
