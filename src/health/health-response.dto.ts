import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    enum: ['ok', 'degraded'],
    example: 'ok',
    description: "'ok' when all dependencies are reachable",
  })
  status: 'ok' | 'degraded';

  @ApiProperty({
    example: '0.0.1',
    description: 'API version (from package.json)',
  })
  version: string;

  @ApiProperty({
    enum: ['up', 'down'],
    example: 'up',
    description: 'Database connectivity (SELECT 1 probe)',
  })
  db: 'up' | 'down';
}
