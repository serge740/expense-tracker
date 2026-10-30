import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { EmailModule } from '../../global/email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [JwtModule.register({}), EmailModule, forwardRef(() => NotificationsModule)],
  controllers: [ClientAuthController],
  providers: [ClientAuthService, ClientJwtAuthGuard],
  exports: [ClientJwtAuthGuard, JwtModule, ClientAuthService],
})
export class ClientAuthModule {}
