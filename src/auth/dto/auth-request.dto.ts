import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Swagger documentation classes for the public contract.
 * Validation truth lives in src/domain/auth.schema.ts (zod) — keep both
 * in sync when the contract changes.
 */
export class RegisterRequestDto {
  @ApiProperty({ example: 'learner@uttirno.test', maxLength: 320 })
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8, maxLength: 128 })
  password: string;

  @ApiPropertyOptional({ example: 'রাহিম উদ্দিন', maxLength: 120 })
  name?: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: 'learner@uttirno.test' })
  email: string;

  @ApiProperty({ example: 'password123' })
  password: string;
}

export class RefreshRequestDto {
  @ApiProperty({ description: 'Refresh token from register/login/refresh' })
  refreshToken: string;
}
