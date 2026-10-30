import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FamilyModule } from '../family/family.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionFeedService } from './transaction-feed.service';
import { SavedViewsService } from './saved-views.service';
import { TrashService } from './trash.service';

@Module({
  imports: [ClientAuthModule, NotificationsModule, FamilyModule, WalletModule],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionFeedService, SavedViewsService, TrashService],
  exports: [TransactionService],
})
export class TransactionModule {}
