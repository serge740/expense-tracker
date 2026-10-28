import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';
import { DebtPlanModule } from './debt-plan.module';

@Module({
  imports: [ClientAuthModule, NotificationsModule, RemindersModule, DebtPlanModule],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
