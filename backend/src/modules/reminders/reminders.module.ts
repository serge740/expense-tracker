import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { WebPushModule } from '../web-push/web-push.module';
import { PushService } from './push.service';
import { RemindersController, RemindersTickController } from './reminders.controller';
import { RemindersScheduler } from './reminders.scheduler';
import { RemindersService } from './reminders.service';
import { DebtPlanModule } from '../debts/debt-plan.module';

@Module({
  imports: [ClientAuthModule, WebPushModule, DebtPlanModule],
  controllers: [RemindersController, RemindersTickController],
  providers: [PushService, RemindersService, RemindersScheduler],
  exports: [RemindersService],
})
export class RemindersModule {}
