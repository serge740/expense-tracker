import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';

@Module({
  imports: [ClientAuthModule, NotificationsModule],
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
