import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createSessionSchema,
  saveAnswerSchema,
  sessionHistoryQuerySchema,
} from '../domain/session.schema';
import type {
  CreateSessionInput,
  SaveAnswerInput,
  SessionHistoryQuery,
} from '../domain/session.schema';
import {
  CreateSessionRequestDto,
  SaveAnswerRequestDto,
  SaveAnswerResponseDto,
  SessionHistoryDto,
  SessionPlayStateDto,
  SessionResultDto,
  SessionSummaryDto,
} from './dto/session.dto';
import { QuizSessionsService } from './quiz-sessions.service';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class QuizSessionsController {
  constructor(private readonly sessions: QuizSessionsService) {}

  @Get()
  @ApiOperation({ summary: 'Attempt history (own sessions, newest first)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ type: SessionHistoryDto })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(sessionHistoryQuerySchema))
    query: SessionHistoryQuery,
  ): Promise<SessionHistoryDto> {
    return this.sessions.history(user.userId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a mock exam session (snapshots N random PUBLISHED questions; clock not started)',
  })
  @ApiBody({ type: CreateSessionRequestDto })
  @ApiCreatedResponse({ type: SessionSummaryDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSessionSchema))
    body: CreateSessionInput,
  ): Promise<SessionSummaryDto> {
    return this.sessions.create(user.userId, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Session summary (any status)' })
  @ApiOkResponse({ type: SessionSummaryDto })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SessionSummaryDto> {
    return this.sessions.summary(user.userId, id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the clock (CREATED → IN_PROGRESS)' })
  @ApiOkResponse({ type: SessionPlayStateDto })
  @ApiConflictResponse({ description: 'Session has already been started' })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SessionPlayStateDto> {
    return this.sessions.start(user.userId, id);
  }

  @Get(':id/play')
  @ApiOperation({
    summary:
      'Play state for the exam player (questions WITHOUT answers, saved selections, server clock) — resume-safe',
  })
  @ApiOkResponse({ type: SessionPlayStateDto })
  @ApiConflictResponse({ description: 'Session has ended — fetch the result' })
  play(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SessionPlayStateDto> {
    return this.sessions.playState(user.userId, id);
  }

  @Patch(':id/answers')
  @ApiOperation({
    summary: 'Save one answer (server-side persistence on every selection)',
  })
  @ApiBody({ type: SaveAnswerRequestDto })
  @ApiOkResponse({ type: SaveAnswerResponseDto })
  @ApiConflictResponse({ description: 'Session is not accepting answers' })
  saveAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveAnswerSchema)) body: SaveAnswerInput,
  ): Promise<SaveAnswerResponseDto> {
    return this.sessions.saveAnswer(user.userId, id, body);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submit and score (server-side, 0.50 negative marking) — first reveal of answers',
  })
  @ApiOkResponse({ type: SessionResultDto })
  @ApiConflictResponse({
    description: 'Session already submitted / not started',
  })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SessionResultDto> {
    return this.sessions.submit(user.userId, id);
  }

  @Get(':id/result')
  @ApiOperation({
    summary: 'Full result with correct answers and explanations',
  })
  @ApiOkResponse({ type: SessionResultDto })
  @ApiConflictResponse({
    description: 'Results are available only after submission',
  })
  result(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SessionResultDto> {
    return this.sessions.result(user.userId, id);
  }
}
