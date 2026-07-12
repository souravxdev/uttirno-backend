import { z } from 'zod';
import {
  difficultyEnum,
  questionLanguageEnum,
  sourceTypeEnum,
} from './question.schema';

/** Fixed CSV template — header row required, exactly these columns. */
export const CSV_COLUMNS = [
  'subjectSlug',
  'topicSlug',
  'language',
  'stem',
  'option1',
  'option2',
  'option3',
  'option4',
  'correctOption',
  'explanation',
  'difficulty',
  'sourceType',
  'sourceYear',
  'sourceExam',
] as const;

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

/**
 * Per-row shape validation. `correctOption` is human-friendly 1–4 (converted
 * to 0-based later); difficulty/sourceYear/sourceExam may be empty cells.
 * Question INVARIANTS are not re-declared here — rows transform into create
 * candidates and run through questionCreateSchema.
 */
export const csvRowSchema = z.object({
  subjectSlug: z.string().min(1),
  topicSlug: z.string().min(1),
  language: questionLanguageEnum,
  stem: z.string().min(1),
  option1: z.string().min(1),
  option2: z.string().min(1),
  option3: z.string().min(1),
  option4: z.string().min(1),
  correctOption: z.coerce.number().int().min(1).max(4),
  explanation: z.string().min(1),
  difficulty: z.preprocess(emptyToUndefined, difficultyEnum.default('MEDIUM')),
  sourceType: sourceTypeEnum,
  sourceYear: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().optional(),
  ),
  sourceExam: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});
export type CsvRow = z.infer<typeof csvRowSchema>;
