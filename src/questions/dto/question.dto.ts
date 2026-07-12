import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Difficulty,
  QuestionLanguage,
  QuestionStatus,
  SourceType,
} from '../../generated/prisma/enums';

export class SubjectRefDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'bangla' })
  slug: string;

  @ApiProperty({ example: 'বাংলা' })
  name: string;
}

export class TopicRefDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'sahitto' })
  slug: string;

  @ApiProperty({ example: 'সাহিত্য' })
  name: string;

  @ApiProperty({ type: SubjectRefDto })
  subject: SubjectRefDto;
}

/**
 * Learner-facing question shape. correctIndex and explanation are
 * INTENTIONALLY absent — correct answers never reach the client before
 * session submission.
 */
export class PublicQuestionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: "'সোনার তরী' কাব্যগ্রন্থের রচয়িতা কে?" })
  stem: string;

  @ApiProperty({ type: [String], minItems: 4, maxItems: 4 })
  options: string[];

  @ApiProperty({ enum: Object.values(Difficulty) })
  difficulty: Difficulty;

  @ApiProperty({ enum: Object.values(SourceType) })
  sourceType: SourceType;

  @ApiProperty({ type: Number, nullable: true, example: 2015 })
  sourceYear: number | null;

  @ApiProperty({ type: String, nullable: true, example: '৩৫তম বিসিএস' })
  sourceExam: string | null;

  @ApiProperty({ enum: Object.values(QuestionLanguage) })
  language: QuestionLanguage;

  @ApiProperty({ type: TopicRefDto })
  topic: TopicRefDto;
}

export class PublicQuestionListDto {
  @ApiProperty({ type: [PublicQuestionDto] })
  items: PublicQuestionDto[];

  @ApiProperty({ example: 8 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}

/** Admin shape — includes the answer key and workflow status. */
export class AdminQuestionDto extends PublicQuestionDto {
  @ApiProperty({ minimum: 0, maximum: 3 })
  correctIndex: number;

  @ApiProperty()
  explanation: string;

  @ApiProperty({ enum: Object.values(QuestionStatus) })
  status: QuestionStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class AdminQuestionListDto {
  @ApiProperty({ type: [AdminQuestionDto] })
  items: AdminQuestionDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}

export class QuestionCreateRequestDto {
  @ApiProperty()
  topicId: string;

  @ApiProperty({ example: 'বাংলা ভাষার প্রাচীনতম নিদর্শন কোনটি?' })
  stem: string;

  @ApiProperty({ type: [String], minItems: 4, maxItems: 4 })
  options: string[];

  @ApiProperty({ minimum: 0, maximum: 3 })
  correctIndex: number;

  @ApiProperty()
  explanation: string;

  @ApiPropertyOptional({ enum: Object.values(Difficulty), default: 'MEDIUM' })
  difficulty?: Difficulty;

  @ApiProperty({ enum: Object.values(SourceType) })
  sourceType: SourceType;

  @ApiPropertyOptional({ example: 2017 })
  sourceYear?: number;

  @ApiPropertyOptional({ example: '৩৮তম বিসিএস' })
  sourceExam?: string;

  @ApiPropertyOptional({
    enum: Object.values(QuestionStatus),
    default: 'DRAFT',
  })
  status?: QuestionStatus;

  @ApiProperty({ enum: Object.values(QuestionLanguage) })
  language: QuestionLanguage;
}

export class QuestionUpdateRequestDto {
  @ApiPropertyOptional()
  topicId?: string;

  @ApiPropertyOptional()
  stem?: string;

  @ApiPropertyOptional({ type: [String], minItems: 4, maxItems: 4 })
  options?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 3 })
  correctIndex?: number;

  @ApiPropertyOptional()
  explanation?: string;

  @ApiPropertyOptional({ enum: Object.values(Difficulty) })
  difficulty?: Difficulty;

  @ApiPropertyOptional({ enum: Object.values(SourceType) })
  sourceType?: SourceType;

  @ApiPropertyOptional()
  sourceYear?: number;

  @ApiPropertyOptional()
  sourceExam?: string;

  @ApiPropertyOptional({ enum: Object.values(QuestionStatus) })
  status?: QuestionStatus;

  @ApiPropertyOptional({ enum: Object.values(QuestionLanguage) })
  language?: QuestionLanguage;
}
