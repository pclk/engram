import { z } from 'zod';
import { getDb } from '@/lib/db';
import { createSession } from '@/src/server/api/auth';
import { hashPassword, verifyPassword } from './password';

export const loginInputSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1)
});

export const registerInputSchema = z.object({
	name: z.string().trim().min(1).max(120),
	email: z.string().email(),
	password: z.string().min(8)
});

export const loginWithPassword = async (input: z.infer<typeof loginInputSchema>) => {
	const email = input.email.trim().toLowerCase();
	const user = await getDb().user.findUnique({ where: { email } });
	if (!user) {
		return { ok: false as const, status: 401, message: 'Invalid email or password.' };
	}

	const isValidPassword = await verifyPassword(input.password, user.passwordHash);
	if (!isValidPassword) {
		return { ok: false as const, status: 401, message: 'Invalid email or password.' };
	}

	const { token, session } = await createSession(user.id);
	return { ok: true as const, user, session, token };
};

export const registerWithPassword = async (input: z.infer<typeof registerInputSchema>) => {
	const email = input.email.trim().toLowerCase();
	const existingUser = await getDb().user.findUnique({ where: { email } });
	if (existingUser) {
		return { ok: false as const, status: 409, message: 'An account with that email already exists.' };
	}

	const passwordHash = await hashPassword(input.password);
	const user = await getDb().user.create({
		data: {
			name: input.name.trim(),
			email,
			passwordHash
		}
	});

	const { token, session } = await createSession(user.id);
	return { ok: true as const, user, session, token };
};
