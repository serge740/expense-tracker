import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { FamilyModule } from '../family/family.module';

@Module({
  imports: [ClientAuthModule, FamilyModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
