'use server';

import { redirect } from 'next/navigation';
import { loginInputSchema, loginWithPassword } from '@/lib/server/auth-service';
import { setSessionCookie } from '@/src/server/api/auth';

const getString = (value: FormDataEntryValue | null) => (typeof value === 'string' ? value : '');

export async function loginAction(formData: FormData) {
	const email = getString(formData.get('email'));
	const password = getString(formData.get('password'));

	const parsed = loginInputSchema.safeParse({ email, password });
	if (!parsed.success) {
		const params = new URLSearchParams({
			error: 'Enter a valid email and password.',
			email
		});
		redirect(`/login?${params.toString()}`);
	}

	const result = await loginWithPassword(parsed.data);
	if (!result.ok) {
		const params = new URLSearchParams({
			error: result.message,
			email
		});
		redirect(`/login?${params.toString()}`);
	}

	await setSessionCookie(result.token, result.session.expiresAt);
	redirect('/');
}
