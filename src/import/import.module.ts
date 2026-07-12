import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { AiClient } from './ai-client';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [QuestionsModule],
  controllers: [ImportController],
  providers: [ImportService, AiClient],
  exports: [ImportService],
})
export class ImportModule {}
