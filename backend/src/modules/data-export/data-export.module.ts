import { Module } from '@nestjs/common';
import { ITSupportAuthModule } from '../it-support-auth/it-support-auth.module';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { DataImportService } from './data-import.service';

@Module({
  imports: [ITSupportAuthModule],
  controllers: [DataExportController],
  providers: [DataExportService, DataImportService],
})
export class DataExportModule {}
