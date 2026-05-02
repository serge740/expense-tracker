import { Body, Controller, Get, HttpException, Put, Req, UseGuards } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@Controller('budget')
@UseGuards(ClientJwtAuthGuard)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('current')
  async getCurrent(@Req() req: RequestWithClient) {
    try {
      return await this.budgetService.getCurrent(req.client.id);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch budget', 400);
    }
  }

  @Put()
  async upsert(@Req() req: RequestWithClient, @Body() dto: UpsertBudgetDto) {
    try {
      return await this.budgetService.upsert(req.client.id, dto);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to save budget', 400);
    }
  }
}
