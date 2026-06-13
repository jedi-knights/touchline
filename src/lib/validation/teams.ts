import { z } from 'zod';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const URL_OR_EMPTY = z
  .string()
  .max(2048, 'Crest URL must be at most 2048 characters.')
  .url('Crest URL must be a valid URL.')
  .optional();

export const teamSchema = z.object({
  name: z
    .string()
    .min(1, 'Team name is required.')
    .max(120, 'Team name must be at most 120 characters.')
    .trim(),
  color: z
    .string()
    .regex(HEX_COLOR, 'Color must be a 6-character hex value (e.g. #0b6b3a).')
    .optional(),
  crestUrl: URL_OR_EMPTY,
});

export type TeamInput = z.infer<typeof teamSchema>;
