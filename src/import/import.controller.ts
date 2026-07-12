import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { aiDraftRequestSchema } from '../domain/import.schema';
import type { AiDraftRequest } from '../domain/import.schema';
import {
  AiDraftReportDto,
  AiDraftRequestDto,
  ImportReportDto,
} from './dto/import.dto';
import { ImportService } from './import.service';

/** Minimal shape of the multer file — avoids the @types/multer dependency. */
interface UploadedCsvFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@ApiTags('admin/import')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Requires ADMIN role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('csv')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  @ApiOperation({
    summary:
      'Bulk-import questions from CSV (fixed template; rows enter IN_REVIEW; duplicate stems skipped)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: ImportReportDto })
  importCsv(@UploadedFile() file?: UploadedCsvFile): Promise<ImportReportDto> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException(
        'CSV file is required (multipart field "file")',
      );
    }
    return this.importService.importCsv(file.buffer);
  }

  @Post('ai-drafts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate AI question drafts — always AI_GENERATED + IN_REVIEW, never published',
  })
  @ApiBody({ type: AiDraftRequestDto })
  @ApiOkResponse({ type: AiDraftReportDto })
  @ApiServiceUnavailableResponse({
    description: 'ANTHROPIC_API_KEY is not configured',
  })
  @ApiBadGatewayResponse({
    description: 'AI provider failed or returned garbage',
  })
  generateAiDrafts(
    @Body(new ZodValidationPipe(aiDraftRequestSchema)) body: AiDraftRequest,
  ): Promise<AiDraftReportDto> {
    return this.importService.generateAiDrafts(body);
  }
}
