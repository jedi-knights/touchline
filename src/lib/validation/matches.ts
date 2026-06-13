import { z } from 'zod';

export const createMatchSchema = z.object({
  sportSlug: z.string().min(1).default('soccer'),
  teamId: z.string().min(1, 'Pick a team.'),
  opponentName: z
    .string()
    .min(1, 'Enter an opponent name.')
    .max(120, 'Opponent name must be at most 120 characters.')
    .trim(),
  lineupPlayerIds: z
    .array(z.string().min(1))
    .min(1, 'Pick at least one player for the starting lineup.')
    .max(99, 'Starting lineup is too large.'),
});

export type CreateMatchInput = z.infer<typeof createMatchSchema>;
