import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ClientAuthModule } from './modules/client-auth/client-auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BudgetModule } from './modules/budget/budget.module';
import { OcrModule } from './modules/ocr/ocr.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    PrismaModule,
    ClientAuthModule,
    DevicesModule,
    NotificationsModule,
    WalletModule,
    TransactionModule,
    ReportsModule,
    BudgetModule,
    OcrModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
