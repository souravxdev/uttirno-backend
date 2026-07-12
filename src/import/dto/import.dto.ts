import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Difficulty, QuestionLanguage } from '../../generated/prisma/enums';
import { AdminQuestionDto } from '../../questions/dto/question.dto';

export class RowErrorItemDto {
  @ApiProperty({ example: 'correctOption' })
  path: string;

  @ApiProperty({ example: 'Too small: expected number to be >=1' })
  message: string;
}

export class RowErrorDto {
  @ApiProperty({
    example: 4,
    description: '1-based line number in the file (header is line 1)',
  })
  row: number;

  @ApiProperty({ type: [RowErrorItemDto] })
  errors: RowErrorItemDto[];
}

export class ImportReportDto {
  @ApiProperty({ example: 10, description: 'Data rows found in the file' })
  totalRows: number;

  @ApiProperty({ example: 7, description: 'Rows imported as IN_REVIEW' })
  imported: number;

  @ApiProperty({
    example: 2,
    description: 'Rows skipped — a question with the same stem exists',
  })
  skippedDuplicates: number;

  @ApiProperty({ example: 1, description: 'Rows rejected by validation' })
  failed: number;

  @ApiProperty({ type: [RowErrorDto] })
  rowErrors: RowErrorDto[];
}

export class AiDraftRequestDto {
  @ApiProperty({ description: 'Topic the drafts belong to' })
  topicId: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 5 })
  count?: number;

  @ApiPropertyOptional({
    enum: Object.values(Difficulty),
    default: 'MEDIUM',
  })
  difficulty?: Difficulty;

  @ApiProperty({ enum: Object.values(QuestionLanguage) })
  language: QuestionLanguage;
}

export class AiDraftReportDto {
  @ApiProperty({ example: 5 })
  requested: number;

  @ApiProperty({
    example: 4,
    description: 'Drafts created as AI_GENERATED + IN_REVIEW',
  })
  created: number;

  @ApiProperty({ example: 1 })
  skippedDuplicates: number;

  @ApiProperty({
    example: 0,
    description: 'Drafts the model returned malformed',
  })
  failed: number;

  @ApiProperty({ type: [AdminQuestionDto] })
  drafts: AdminQuestionDto[];
}
