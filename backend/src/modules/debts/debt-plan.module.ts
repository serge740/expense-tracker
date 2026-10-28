import { Module } from '@nestjs/common';
import { DebtPlanService } from './debt-plan.service';

/** Its own small module, so both Debts and Reminders can use it without importing each other. */
@Module({
  providers: [DebtPlanService],
  exports: [DebtPlanService],
})
export class DebtPlanModule {}
