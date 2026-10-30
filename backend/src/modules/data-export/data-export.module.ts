import { Module } from '@nestjs/common';
import { ITSupportAuthModule } from '../it-support-auth/it-support-auth.module';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { DataImportService } from './data-import.service';
import { ITAdminOrBackupKeyGuard } from '../../guards/itAdminOrBackupKeyGuard.guard';

@Module({
  imports: [ITSupportAuthModule],
  controllers: [DataExportController],
  // ITAdminOrBackupKeyGuard must be a provider here (not just referenced via @UseGuards) —
  // passing a class to @UseGuards only gets constructor injection (its JwtService) if Nest's DI
  // container knows about it; otherwise it's instantiated bare and crashes at request time.
  providers: [DataExportService, DataImportService, ITAdminOrBackupKeyGuard],
})
export class DataExportModule {}
