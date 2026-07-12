import { z } from 'zod';

export const createSessionSchema = z.object({
  questionCount: z.number().int().min(1).max(200),
  timeLimitSec: z.number().int().min(60).max(14400),
  subjects: z.array(z.string().min(1)).min(1).optional(),
  // Topic-level filter (slugs) — used by practice mode.
  topics: z.array(z.string().min(1)).min(1).optional(),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const saveAnswerSchema = z.object({
  questionId: z.string().min(1),
  // Absent = leave the selection unchanged (used by flag-only saves);
  // null = clear a previous selection (question becomes skipped again);
  // number = set the selection.
  selectedIndex: z.number().int().min(0).max(3).nullable().optional(),
  // Mark/unmark the question for review; survives resume.
  flagged: z.boolean().optional(),
  timeTakenSec: z.number().int().min(0).optional(),
});
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export const sessionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SessionHistoryQuery = z.infer<typeof sessionHistoryQuerySchema>;
