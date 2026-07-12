import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  QuestionLanguage,
  QuizSessionStatus,
} from '../../generated/prisma/enums';

export class CreateSessionRequestDto {
  @ApiProperty({ minimum: 1, maximum: 200, example: 10 })
  questionCount: number;

  @ApiProperty({
    minimum: 60,
    maximum: 14400,
    example: 600,
    description: 'Exam duration in seconds',
  })
  timeLimitSec: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['bangla', 'general-knowledge'],
    description: 'Restrict questions to these subject slugs',
  })
  subjects?: string[];
}

export class SaveAnswerRequestDto {
  @ApiProperty()
  questionId: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 3,
    description: 'null clears the selection (question counts as skipped)',
  })
  selectedIndex: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  timeTakenSec?: number;
}

export class SessionSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: Object.values(QuizSessionStatus) })
  status: QuizSessionStatus;

  @ApiProperty()
  questionCount: number;

  @ApiProperty()
  timeLimitSec: number;

  @ApiProperty({ type: Date, nullable: true })
  startedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  expiresAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  submittedAt: Date | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 6.5,
    description: 'Final score — present only after SUBMITTED/EXPIRED',
  })
  score: number | null;

  @ApiProperty()
  createdAt: Date;
}

/**
 * In-exam question shape. correctIndex and explanation are INTENTIONALLY
 * absent — answers are never sent to the client before submission.
 */
export class SessionQuestionDto {
  @ApiProperty({ example: 0 })
  order: number;

  @ApiProperty()
  questionId: string;

  @ApiProperty({ example: "'সোনার তরী' কাব্যগ্রন্থের রচয়িতা কে?" })
  stem: string;

  @ApiProperty({ type: [String], minItems: 4, maxItems: 4 })
  options: string[];

  @ApiProperty({ enum: Object.values(QuestionLanguage) })
  language: QuestionLanguage;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Previously saved selection (resume support)',
  })
  selectedIndex: number | null;
}

export class SessionPlayStateDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: Object.values(QuizSessionStatus) })
  status: QuizSessionStatus;

  @ApiProperty()
  questionCount: number;

  @ApiProperty()
  timeLimitSec: number;

  @ApiProperty({ type: Date, nullable: true })
  startedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  expiresAt: Date | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Server-computed seconds left; null while CREATED',
  })
  remainingSec: number | null;

  @ApiProperty({ type: [SessionQuestionDto] })
  questions: SessionQuestionDto[];
}

export class SaveAnswerResponseDto {
  @ApiProperty()
  questionId: string;

  @ApiProperty({ type: Number, nullable: true })
  selectedIndex: number | null;

  @ApiProperty({ description: 'Server-computed seconds left' })
  remainingSec: number;
}

export class SessionResultItemDto {
  @ApiProperty()
  order: number;

  @ApiProperty()
  questionId: string;

  @ApiProperty()
  stem: string;

  @ApiProperty({ type: [String] })
  options: string[];

  @ApiProperty({ enum: Object.values(QuestionLanguage) })
  language: QuestionLanguage;

  @ApiProperty({ type: Number, nullable: true })
  selectedIndex: number | null;

  @ApiProperty({ minimum: 0, maximum: 3 })
  correctIndex: number;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: 'null = skipped',
  })
  isCorrect: boolean | null;

  @ApiProperty()
  explanation: string;
}

export class SessionResultTotalsDto {
  @ApiProperty({ example: 7 })
  correct: number;

  @ApiProperty({ example: 2 })
  wrong: number;

  @ApiProperty({ example: 1 })
  skipped: number;

  @ApiProperty({ example: 7, description: 'correct × 1.00' })
  positiveMarks: number;

  @ApiProperty({ example: 1, description: 'wrong × 0.50' })
  negativeMarks: number;

  @ApiProperty({ example: 6, description: 'positiveMarks − negativeMarks' })
  score: number;
}

export class SessionResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: Object.values(QuizSessionStatus) })
  status: QuizSessionStatus;

  @ApiProperty()
  questionCount: number;

  @ApiProperty()
  timeLimitSec: number;

  @ApiProperty({ type: Date, nullable: true })
  startedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  submittedAt: Date | null;

  @ApiProperty({ type: SessionResultTotalsDto })
  totals: SessionResultTotalsDto;

  @ApiProperty({ type: [SessionResultItemDto] })
  items: SessionResultItemDto[];
}

export class SessionHistoryDto {
  @ApiProperty({ type: [SessionSummaryDto] })
  items: SessionSummaryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
