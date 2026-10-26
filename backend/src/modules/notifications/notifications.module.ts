import { Module, forwardRef } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { WebPushModule } from '../web-push/web-push.module';

@Module({
  imports: [forwardRef(() => ClientAuthModule), WebPushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
