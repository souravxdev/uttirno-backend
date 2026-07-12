import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';

export class UserDto {
  @ApiProperty({ example: 'cmrhi7gr200028tuyrux8n0oy' })
  id: string;

  @ApiProperty({ example: 'learner@uttirno.test' })
  email: string;

  @ApiProperty({ example: 'রাহিম উদ্দিন', type: String, nullable: true })
  name: string | null;

  @ApiProperty({ enum: Object.values(Role), example: Role.LEARNER })
  role: Role;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({ description: 'Short-lived bearer token' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived token for POST /auth/refresh' })
  refreshToken: string;
}
