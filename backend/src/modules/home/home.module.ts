import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { DebtsModule } from '../debts/debts.module';
import { ScheduledModule } from '../scheduled/scheduled.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [ClientAuthModule, DebtsModule, ScheduledModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
