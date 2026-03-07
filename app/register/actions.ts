'use server';

import { redirect } from 'next/navigation';
import { registerInputSchema, registerWithPassword } from '@/lib/server/auth-service';
import { setSessionCookie } from '@/src/server/api/auth';

const getString = (value: FormDataEntryValue | null) => (typeof value === 'string' ? value : '');

export async function registerAction(formData: FormData) {
	const name = getString(formData.get('name'));
	const email = getString(formData.get('email'));
	const password = getString(formData.get('password'));

	const parsed = registerInputSchema.safeParse({ name, email, password });
	if (!parsed.success) {
		const params = new URLSearchParams({
			error: 'Enter a valid name, email, and password.',
			name,
			email
		});
		redirect(`/register?${params.toString()}`);
	}

	const result = await registerWithPassword(parsed.data);
	if (!result.ok) {
		const params = new URLSearchParams({
			error: result.message,
			name,
			email
		});
		redirect(`/register?${params.toString()}`);
	}

	await setSessionCookie(result.token, result.session.expiresAt);
	redirect('/');
}
