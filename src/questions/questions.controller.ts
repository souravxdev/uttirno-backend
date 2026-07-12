import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { publicQuestionListQuerySchema } from '../domain/question.schema';
import type { PublicQuestionListQuery } from '../domain/question.schema';
import { PublicQuestionListDto } from './dto/question.dto';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Browse PUBLISHED questions (learner view — no answers, no explanations)',
  })
  @ApiQuery({ name: 'subject', required: false, description: 'Subject slug' })
  @ApiQuery({ name: 'topic', required: false, description: 'Topic slug' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({
    name: 'sourceType',
    required: false,
    enum: ['PAST_PAPER', 'ORIGINAL', 'AI_GENERATED'],
  })
  @ApiQuery({ name: 'language', required: false, enum: ['BN', 'EN'] })
  @ApiQuery({
    name: 'difficulty',
    required: false,
    enum: ['EASY', 'MEDIUM', 'HARD'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ type: PublicQuestionListDto })
  list(
    @Query(new ZodValidationPipe(publicQuestionListQuerySchema))
    query: PublicQuestionListQuery,
  ): Promise<PublicQuestionListDto> {
    return this.questions.publicList(query);
  }
}
