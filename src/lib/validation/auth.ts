/**
 * Zod schemas for auth forms. Shared between server actions and any future
 * client-side validation.
 */
import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(200, 'Password must be at most 200 characters.'),
  name: z.string().max(100, 'Name must be at most 100 characters.').optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(200),
});

export type SignInInput = z.infer<typeof signInSchema>;
