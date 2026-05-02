import { Module } from '@nestjs/common';
import { BudgetController } from './budget.controller';
import { BudgetService } from './budget.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';

@Module({
  imports: [ClientAuthModule],
  controllers: [BudgetController],
  providers: [BudgetService],
})
export class BudgetModule {}
