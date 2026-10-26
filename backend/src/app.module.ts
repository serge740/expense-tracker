import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ClientAuthModule } from './modules/client-auth/client-auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { WebPushModule } from './modules/web-push/web-push.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BudgetModule } from './modules/budget/budget.module';
import { DebtsModule } from './modules/debts/debts.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { PasskeyModule } from './modules/passkey/passkey.module';
import { WellKnownModule } from './modules/well-known/well-known.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { ScheduledModule } from './modules/scheduled/scheduled.module';
import { HomeModule } from './modules/home/home.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    ClientAuthModule,
    DevicesModule,
    NotificationsModule,
    RealtimeModule,
    WebPushModule,
    WalletModule,
    TransactionModule,
    ReportsModule,
    BudgetModule,
    DebtsModule,
    ReceiptsModule,
    PasskeyModule,
    WellKnownModule,
    RemindersModule,
    ScheduledModule,
    HomeModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
