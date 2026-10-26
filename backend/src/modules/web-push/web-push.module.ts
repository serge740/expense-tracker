import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { WebPushController } from './web-push.controller';
import { WebPushService } from './web-push.service';

@Module({
  imports: [ClientAuthModule],
  controllers: [WebPushController],
  providers: [WebPushService],
  exports: [WebPushService],
})
export class WebPushModule {}
