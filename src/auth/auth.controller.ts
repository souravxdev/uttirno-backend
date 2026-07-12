import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  loginSchema,
  refreshSchema,
  registerSchema,
} from '../domain/auth.schema';
import type {
  LoginInput,
  RefreshInput,
  RegisterInput,
} from '../domain/auth.schema';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  LoginRequestDto,
  RefreshRequestDto,
  RegisterRequestDto,
} from './dto/auth-request.dto';
import { AuthResponseDto, UserDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit(10, 60)
  @HttpCode(HttpStatus.CREATED)
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  @ApiOperation({ summary: 'Register a new learner account' })
  @ApiBody({ type: RegisterRequestDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ): Promise<AuthResponseDto> {
    return this.auth.register(body);
  }

  @Post('login')
  @RateLimit(20, 60)
  @HttpCode(HttpStatus.OK)
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
  ): Promise<AuthResponseDto> {
    return this.auth.login(body);
  }

  @Post('refresh')
  @RateLimit(30, 60)
  @HttpCode(HttpStatus.OK)
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiBody({ type: RefreshRequestDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
  ): Promise<AuthResponseDto> {
    return this.auth.refresh(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return this.auth.getMe(user.userId);
  }
}
