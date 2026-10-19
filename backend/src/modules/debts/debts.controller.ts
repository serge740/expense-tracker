import {
  Body, Controller, Delete, Get, HttpCode, HttpException, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { DebtsService } from './debts.service';
import { CreateDebtDto, DebtPaymentDto, UpdateDebtDto } from './dto/debt.dto';

const fail = (e: any, msg: string) => new HttpException(e?.message || msg, e?.status || 400);

@Controller('debts')
@UseGuards(ClientJwtAuthGuard)
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Get()
  async list(@Req() req: RequestWithClient, @Query('kind') kind?: string, @Query('status') status?: string) {
    try { return await this.debts.list(req.client.id, kind, status); } catch (e) { throw fail(e, 'Failed to load debts'); }
  }

  @Get('summary')
  async summary(@Req() req: RequestWithClient) {
    try { return await this.debts.summary(req.client.id); } catch (e) { throw fail(e, 'Failed to load summary'); }
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.debts.findOne(req.client.id, id); } catch (e) { throw fail(e, 'Debt not found'); }
  }

  @Post()
  async create(@Req() req: RequestWithClient, @Body() dto: CreateDebtDto) {
    try { return await this.debts.create(req.client.id, dto); } catch (e) { throw fail(e, 'Could not save debt'); }
  }

  @Patch(':id')
  async update(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: UpdateDebtDto) {
    try { return await this.debts.update(req.client.id, id, dto); } catch (e) { throw fail(e, 'Could not update debt'); }
  }

  @Post(':id/payments')
  @HttpCode(201)
  async pay(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: DebtPaymentDto) {
    try { return await this.debts.addPayment(req.client.id, id, dto); } catch (e) { throw fail(e, 'Could not record payment'); }
  }

  @Delete(':id/payments/:paymentId')
  async unpay(@Req() req: RequestWithClient, @Param('id') id: string, @Param('paymentId') paymentId: string) {
    try { return await this.debts.removePayment(req.client.id, id, paymentId); } catch (e) { throw fail(e, 'Could not remove payment'); }
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.debts.remove(req.client.id, id); } catch (e) { throw fail(e, 'Could not delete debt'); }
  }
}
