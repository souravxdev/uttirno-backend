import { z } from 'zod';

/**
 * Question invariants (mirrored as DB CHECK constraints in the initial
 * migration — the DB is the last line of defense, zod is the first):
 * - PAST_PAPER ⇒ sourceYear + sourceExam
 * - AI_GENERATED can never be CREATED as PUBLISHED (updates may publish —
 *   that is the Phase 2 review-approval path)
 * - correctIndex must point at an existing option
 * - BCS Preliminary MCQs have exactly 4 options
 */

export const difficultyEnum = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const sourceTypeEnum = z.enum([
  'PAST_PAPER',
  'ORIGINAL',
  'AI_GENERATED',
]);
export const questionStatusEnum = z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED']);
export const questionLanguageEnum = z.enum(['BN', 'EN']);

const questionCoreSchema = z.object({
  topicId: z.string().min(1),
  stem: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  difficulty: difficultyEnum.default('MEDIUM'),
  sourceType: sourceTypeEnum,
  sourceYear: z.number().int().min(1972).max(2100).optional().nullable(),
  sourceExam: z.string().min(1).max(200).optional().nullable(),
  status: questionStatusEnum.default('DRAFT'),
  language: questionLanguageEnum,
});

type QuestionCore = z.infer<typeof questionCoreSchema>;

function addInvariantIssues(
  data: QuestionCore,
  ctx: z.RefinementCtx,
  opts: { forCreate: boolean },
): void {
  if (
    data.sourceType === 'PAST_PAPER' &&
    (data.sourceYear == null || !data.sourceExam)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['sourceYear'],
      message: 'PAST_PAPER questions require sourceYear and sourceExam',
    });
  }
  if (
    opts.forCreate &&
    data.sourceType === 'AI_GENERATED' &&
    data.status === 'PUBLISHED'
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'AI_GENERATED questions can never be created as PUBLISHED',
    });
  }
  if (data.correctIndex >= data.options.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['correctIndex'],
      message: 'correctIndex must point at an existing option',
    });
  }
}

export const questionCreateSchema = questionCoreSchema.superRefine((d, ctx) =>
  addInvariantIssues(d, ctx, { forCreate: true }),
);
export type QuestionCreateInput = z.infer<typeof questionCreateSchema>;

/** Validates the merged entity after an update patch is applied. */
export const questionMergedSchema = questionCoreSchema.superRefine((d, ctx) =>
  addInvariantIssues(d, ctx, { forCreate: false }),
);

export const questionUpdateSchema = questionCoreSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Update must change at least one field',
  });
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;

export const publicQuestionListQuerySchema = z.object({
  subject: z.string().min(1).optional(),
  topic: z.string().min(1).optional(),
  year: z.coerce.number().int().optional(),
  sourceType: sourceTypeEnum.optional(),
  language: questionLanguageEnum.optional(),
  difficulty: difficultyEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PublicQuestionListQuery = z.infer<
  typeof publicQuestionListQuerySchema
>;

export const adminQuestionListQuerySchema =
  publicQuestionListQuerySchema.extend({
    status: questionStatusEnum.optional(),
    topicId: z.string().min(1).optional(),
  });
export type AdminQuestionListQuery = z.infer<
  typeof adminQuestionListQuerySchema
>;
