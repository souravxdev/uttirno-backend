import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  adminQuestionListQuerySchema,
  questionCreateSchema,
  questionUpdateSchema,
} from '../domain/question.schema';
import type {
  AdminQuestionListQuery,
  QuestionCreateInput,
  QuestionUpdateInput,
} from '../domain/question.schema';
import {
  AdminQuestionDto,
  AdminQuestionListDto,
  QuestionCreateRequestDto,
  QuestionUpdateRequestDto,
} from './dto/question.dto';
import { QuestionsService } from './questions.service';

@ApiTags('admin/questions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Requires ADMIN role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/questions')
export class AdminQuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  @ApiOperation({ summary: 'List questions (any status, includes answers)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['DRAFT', 'IN_REVIEW', 'PUBLISHED'],
  })
  @ApiQuery({ name: 'topicId', required: false })
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
  @ApiOkResponse({ type: AdminQuestionListDto })
  list(
    @Query(new ZodValidationPipe(adminQuestionListQuerySchema))
    query: AdminQuestionListQuery,
  ): Promise<AdminQuestionListDto> {
    return this.questions.adminList(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a question (invariants zod-enforced)' })
  @ApiBody({ type: QuestionCreateRequestDto })
  @ApiCreatedResponse({ type: AdminQuestionDto })
  create(
    @Body(new ZodValidationPipe(questionCreateSchema))
    body: QuestionCreateInput,
  ): Promise<AdminQuestionDto> {
    return this.questions.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Question detail (includes answer key)' })
  @ApiOkResponse({ type: AdminQuestionDto })
  @ApiNotFoundResponse({ description: 'Question not found' })
  findOne(@Param('id') id: string): Promise<AdminQuestionDto> {
    return this.questions.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a question — merged entity is re-validated against invariants',
  })
  @ApiBody({ type: QuestionUpdateRequestDto })
  @ApiOkResponse({ type: AdminQuestionDto })
  @ApiNotFoundResponse({ description: 'Question not found' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(questionUpdateSchema))
    body: QuestionUpdateInput,
  ): Promise<AdminQuestionDto> {
    return this.questions.update(id, body);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve (review action): DRAFT | IN_REVIEW → PUBLISHED',
  })
  @ApiOkResponse({ type: AdminQuestionDto })
  @ApiNotFoundResponse({ description: 'Question not found' })
  @ApiConflictResponse({
    description: 'Question is not in an approvable state',
  })
  approve(@Param('id') id: string): Promise<AdminQuestionDto> {
    return this.questions.approve(id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject (review action): IN_REVIEW → DRAFT' })
  @ApiOkResponse({ type: AdminQuestionDto })
  @ApiNotFoundResponse({ description: 'Question not found' })
  @ApiConflictResponse({
    description: 'Only IN_REVIEW questions can be rejected',
  })
  reject(@Param('id') id: string): Promise<AdminQuestionDto> {
    return this.questions.reject(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a question' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Question not found' })
  @ApiConflictResponse({
    description: 'Question has recorded answers and cannot be deleted',
  })
  remove(@Param('id') id: string): Promise<void> {
    return this.questions.remove(id);
  }
}
