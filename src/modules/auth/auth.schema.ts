import { z } from 'zod';

export const registerSchema = z
	.object({
		full_name: z.string().trim().min(2, 'Full name must be at least 2 characters'),
		email: z.string().trim().email('Email must be a valid email address'),
		password: z.string().min(8, 'Password must be at least 8 characters'),
		confirmPassword: z.string().min(1, 'Confirm password is required'),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords must match',
		path: ['confirmPassword'],
	});

export const loginSchema = z.object({
	email: z.string().trim().email('Email must be a valid email address'),
	password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
