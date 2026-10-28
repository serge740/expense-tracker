import { Module } from '@nestjs/common';
import { BudgetController } from './budget.controller';
import { BudgetService } from './budget.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { FamilyModule } from '../family/family.module';

@Module({
  imports: [ClientAuthModule, FamilyModule],
  controllers: [BudgetController],
  providers: [BudgetService],
})
export class BudgetModule {}
