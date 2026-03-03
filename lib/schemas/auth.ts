import { z } from 'zod';

export const updateAvatarSchema = z.object({
	image: z.string().nullable()
});

export const updateProfileSchema = z.object({
	name: z.string().trim().min(1).optional(),
	email: z.string().email().optional()
}).refine(data => Object.keys(data).length > 0, 'At least one profile field is required.');

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1, 'Current password is required.'),
	newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
	confirmPassword: z.string().min(8)
}).refine(data => data.newPassword === data.confirmPassword, {
	message: 'New password and confirmation must match.',
	path: ['confirmPassword']
});
