import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TransactionModule } from '../transaction/transaction.module';
import { ScheduledController } from './scheduled.controller';
import { ScheduledService } from './scheduled.service';

@Module({
  imports: [ClientAuthModule, NotificationsModule, RemindersModule, TransactionModule],
  controllers: [ScheduledController],
  providers: [ScheduledService],
  exports: [ScheduledService],
})
export class ScheduledModule {}
