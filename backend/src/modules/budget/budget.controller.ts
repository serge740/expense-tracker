import { Body, Controller, Get, HttpException, Put, UseGuards } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';
import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope } from '../family/scope/scope';

/** An error that already carries a family `code` (not a member, forbidden…) goes out untouched. */
const bad = (e: any, msg: string) => (e?.response?.code ? e : new HttpException(e?.message || msg, 400));

@Controller('budget')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('current')
  async getCurrent(@ReqScope() scope: Scope) {
    try {
      return await this.budgetService.getCurrent(scope);
    } catch (e: any) {
      throw bad(e, 'Failed to fetch budget');
    }
  }

  @Put()
  async upsert(@ReqScope() scope: Scope, @Body() dto: UpsertBudgetDto) {
    try {
      return await this.budgetService.upsert(scope, dto);
    } catch (e: any) {
      throw bad(e, 'Failed to save budget');
    }
  }
}
