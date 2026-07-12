import { ApiProperty } from '@nestjs/swagger';

export class TopicTreeDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'sahitto' })
  slug: string;

  @ApiProperty({ example: 'সাহিত্য' })
  name: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({
    example: 2,
    description: 'Number of PUBLISHED questions in this topic',
  })
  publishedQuestionCount: number;
}

export class SubjectTreeDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'bangla' })
  slug: string;

  @ApiProperty({ example: 'বাংলা' })
  name: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ type: [TopicTreeDto] })
  topics: TopicTreeDto[];
}

export class ExamTreeDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'bcs-preliminary' })
  slug: string;

  @ApiProperty({ example: 'বিসিএস প্রিলিমিনারি' })
  name: string;

  @ApiProperty({ type: [SubjectTreeDto] })
  subjects: SubjectTreeDto[];
}
