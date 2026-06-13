import { z } from 'zod';

export const recordEventSchema = z.object({
  matchId: z.string().min(1),
  eventTypeId: z.string().min(1),
  side: z.enum(['home', 'away']).nullable().optional(),
  playerId: z.string().min(1).optional(),
});

export type RecordEventInput = z.infer<typeof recordEventSchema>;

export const substitutionSchema = z
  .object({
    matchId: z.string().min(1),
    offPlayerIds: z.array(z.string().min(1)).min(1, 'Pick at least one player coming off.'),
    onPlayerIds: z.array(z.string().min(1)).min(1, 'Pick at least one player coming on.'),
  })
  .refine((v) => v.offPlayerIds.length === v.onPlayerIds.length, {
    message: 'Pick the same number of players coming off and coming on.',
    path: ['onPlayerIds'],
  })
  .refine((v) => new Set(v.offPlayerIds).size === v.offPlayerIds.length, {
    message: 'Duplicate player in OFF list.',
    path: ['offPlayerIds'],
  })
  .refine((v) => new Set(v.onPlayerIds).size === v.onPlayerIds.length, {
    message: 'Duplicate player in ON list.',
    path: ['onPlayerIds'],
  })
  .refine(
    (v) => {
      const off = new Set(v.offPlayerIds);
      return v.onPlayerIds.every((id) => !off.has(id));
    },
    { message: 'A player cannot be in both lists.', path: ['onPlayerIds'] },
  );

export type SubstitutionInput = z.infer<typeof substitutionSchema>;
