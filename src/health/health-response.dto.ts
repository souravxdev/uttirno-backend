import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', description: 'Service liveness indicator' })
  status: string;

  @ApiProperty({
    example: '0.0.1',
    description: 'API version (from package.json)',
  })
  version: string;
}
