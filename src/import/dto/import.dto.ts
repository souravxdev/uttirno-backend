import { ApiProperty } from '@nestjs/swagger';

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
