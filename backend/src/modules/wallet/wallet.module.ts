import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { ExchangeRateService } from './exchange-rate.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ClientAuthModule, NotificationsModule],
  controllers: [WalletController],
  providers: [WalletService, ExchangeRateService],
  exports: [WalletService, ExchangeRateService],
})
export class WalletModule {}
