import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';

@Module({
  imports: [ClientAuthModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
