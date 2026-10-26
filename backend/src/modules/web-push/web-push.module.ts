import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebPushController } from './web-push.controller';
import { WebPushService } from './web-push.service';

// JwtModule (what the sign-in guard needs) is imported directly, NOT ClientAuthModule: ClientAuthModule reaches this
// module through NotificationsModule, so importing it here would make the two import each other and crash the server on start-up.
@Module({
  imports: [JwtModule.register({})],
  controllers: [WebPushController],
  providers: [WebPushService],
  exports: [WebPushService],
})
export class WebPushModule {}
