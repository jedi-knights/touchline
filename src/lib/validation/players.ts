import { z } from 'zod';

export const playerSchema = z.object({
  name: z
    .string()
    .min(1, 'Player name is required.')
    .max(120, 'Player name must be at most 120 characters.')
    .trim(),
  number: z.coerce
    .number()
    .int('Number must be a whole number.')
    .min(0, 'Number must be 0 or greater.')
    .max(999, 'Number must be 999 or less.')
    .optional(),
  position: z.string().max(40, 'Position must be at most 40 characters.').trim().optional(),
  active: z.coerce.boolean().optional(),
});

export type PlayerInput = z.infer<typeof playerSchema>;
