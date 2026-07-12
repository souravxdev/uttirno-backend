import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExamTreeDto } from './dto/taxonomy.dto';
import { TaxonomyService } from './taxonomy.service';

@ApiTags('taxonomy')
@Controller('taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get('tree')
  @ApiOperation({
    summary: 'Exam → subject → topic tree with published-question counts',
  })
  @ApiOkResponse({ type: [ExamTreeDto] })
  getTree(): Promise<ExamTreeDto[]> {
    return this.taxonomy.getTree();
  }
}
