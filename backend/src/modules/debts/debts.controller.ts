import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope } from '../family/scope/scope';
import {
  Body, Controller, Delete, Get, HttpCode, HttpException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { DebtsService } from './debts.service';
import { buildDebtStatementPdf } from './debt-statement-pdf';
import { CreateDebtDto, DebtPaymentDto, InstallmentDto, UpdateDebtDto } from './dto/debt.dto';

/** An error that already carries a family `code` (not a member, forbidden…) goes out untouched. */
const fail = (e: any, msg: string) => (e?.response?.code ? e : new HttpException(e?.message || msg, e?.status || 400));

@Controller('debts')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Get()
  async list(
    @ReqScope() scope: Scope,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('archived') archived?: string,
  ) {
    try { return await this.debts.list(scope, kind, status, archived); } catch (e) { throw fail(e, 'Failed to load loans and debts'); }
  }

  @Get('summary')
  async summary(@ReqScope() scope: Scope) {
    try { return await this.debts.summary(scope); } catch (e) { throw fail(e, 'Failed to load summary'); }
  }

  /** Debt wallet (kind=BORROWED) / Credit wallet (kind=LENT) totals per currency. */
  @Get('ledger')
  async ledger(@ReqScope() scope: Scope, @Query('kind') kind?: string) {
    try { return await this.debts.ledger(scope, kind); } catch (e) { throw fail(e, 'Failed to load ledger'); }
  }

  @Get('ledger/transactions')
  async ledgerTransactions(
    @ReqScope() scope: Scope,
    @Query('kind') kind?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.debts.ledgerTransactions(scope, kind, page ? Number(page) : 1, limit ? Number(limit) : 30);
    } catch (e) { throw fail(e, 'Failed to load ledger transactions'); }
  }

  @Get(':id')
  async findOne(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.debts.findOne(scope, id); } catch (e) { throw fail(e, 'Loan or debt not found'); }
  }

  @Get(':id/transactions')
  async transactions(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.debts.transactionsOf(scope, id); } catch (e) { throw fail(e, 'Failed to load transactions'); }
  }

  /** The statement PDF as base64, so the app can save and share it. */
  @Get(':id/statement')
  async statement(@ReqScope() scope: Scope, @Param('id') id: string) {
    try {
      const d: any = await this.debts.findOne(scope, id);
      const pdf = await buildDebtStatementPdf({
        kind: d.kind, person: d.person, phone: d.phone, currency: d.currency, amount: d.amount, paid: d.paid,
        writtenOffAmount: d.writtenOffAmount, remaining: d.remaining, spent: d.kind === 'BORROWED' ? d.spent : undefined,
        status: d.status, date: d.date, note: d.note,
        payments: [...d.payments].reverse(), installments: d.installments,
        plan: d.plan ? { amount: d.plan.amount, finishesAt: d.plan.finishesAt, paymentsLeft: d.plan.paymentsLeft } : null,
      });
      const name = String(d.person).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'statement';
      return { filename: `${d.kind === 'LENT' ? 'debt' : 'loan'}-${name}.pdf`, base64: pdf.toString('base64') };
    } catch (e) { throw fail(e, 'Failed to build the statement'); }
  }

  @Post()
  async create(@ReqScope() scope: Scope, @Body() dto: CreateDebtDto) {
    try { return await this.debts.create(scope, dto); } catch (e) { throw fail(e, 'Could not save the record'); }
  }

  @Patch(':id')
  async update(@ReqScope() scope: Scope, @Param('id') id: string, @Body() dto: UpdateDebtDto) {
    try { return await this.debts.update(scope, id, dto); } catch (e) { throw fail(e, 'Could not update the record'); }
  }

  @Post(':id/payments')
  @HttpCode(201)
  async pay(@ReqScope() scope: Scope, @Param('id') id: string, @Body() dto: DebtPaymentDto) {
    try { return await this.debts.addPayment(scope, id, dto); } catch (e) { throw fail(e, 'Could not record payment'); }
  }

  @Delete(':id/payments/:paymentId')
  async unpay(@ReqScope() scope: Scope, @Param('id') id: string, @Param('paymentId') paymentId: string) {
    try { return await this.debts.removePayment(scope, id, paymentId); } catch (e) { throw fail(e, 'Could not remove payment'); }
  }

  @Post(':id/installments')
  @HttpCode(201)
  async addInstallment(@ReqScope() scope: Scope, @Param('id') id: string, @Body() dto: InstallmentDto) {
    try { return await this.debts.addInstallment(scope, id, dto); } catch (e) { throw fail(e, 'Could not add pay date'); }
  }

  @Post(':id/installments/:installmentId/move')
  @HttpCode(200)
  async moveInstallment(
    @ReqScope() scope: Scope, @Param('id') id: string, @Param('installmentId') installmentId: string, @Body() dto: InstallmentDto,
  ) {
    try { return await this.debts.moveInstallment(scope, id, installmentId, dto); } catch (e) { throw fail(e, 'Could not move pay date'); }
  }

  @Post(':id/installments/:installmentId/skip')
  @HttpCode(200)
  async skipInstallment(@ReqScope() scope: Scope, @Param('id') id: string, @Param('installmentId') installmentId: string) {
    try { return await this.debts.skipInstallment(scope, id, installmentId); } catch (e) { throw fail(e, 'Could not skip pay date'); }
  }

  @Post(':id/write-off')
  @HttpCode(200)
  async writeOff(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.debts.writeOff(scope, id); } catch (e) { throw fail(e, 'Could not write off'); }
  }

  @Post(':id/reopen')
  @HttpCode(200)
  async reopen(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.debts.reopen(scope, id); } catch (e) { throw fail(e, 'Could not reopen'); }
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.debts.archive(scope, id); } catch (e) { throw fail(e, 'Could not archive'); }
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.debts.restore(scope, id); } catch (e) { throw fail(e, 'Could not restore'); }
  }

  @Delete(':id')
  async remove(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.debts.remove(scope, id); } catch (e) { throw fail(e, 'Could not delete the record'); }
  }
}
