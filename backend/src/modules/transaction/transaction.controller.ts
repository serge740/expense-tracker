import {
  Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope } from '../family/scope/scope';

/** An error that already carries a family `code` (not a member, forbidden, wrong scope…) goes out untouched. */
const bad = (e: any, msg: string) => (e?.response?.code ? e : new HttpException(e?.message || msg, 400));

@Controller('transactions')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  async findAll(@ReqScope() scope: Scope, @Query() query: QueryTransactionDto) {
    try {
      const parsed: QueryTransactionDto = {
        ...query,
        page:  query.page  ? Number(query.page)  : 1,
        limit: query.limit ? Number(query.limit) : 20,
        month: query.month ? Number(query.month) : undefined,
        year:  query.year  ? Number(query.year)  : undefined,
      };
      return await this.transactionService.findAll(scope, parsed);
    } catch (e: any) {
      throw bad(e, 'Failed to fetch transactions');
    }
  }

  @Get('recent')
  async findRecent(
    @ReqScope() scope: Scope,
    @Query('limit') limit?: string,
    @Query('view') view?: string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    try {
      return await this.transactionService.findRecent(scope, limit ? Number(limit) : 3, view, includeLoans);
    } catch (e: any) {
      throw bad(e, 'Failed to fetch recent transactions');
    }
  }

  @Get('history')
  async history(@ReqScope() scope: Scope, @Query() query: QueryTransactionDto) {
    try {
      const parsed: QueryTransactionDto = {
        ...query,
        month: query.month ? Number(query.month) : undefined,
        year:  query.year  ? Number(query.year)  : undefined,
      };
      return await this.transactionService.history(scope, parsed);
    } catch (e: any) {
      throw bad(e, 'Failed to fetch history');
    }
  }

  @Post()
  async create(@ReqScope() scope: Scope, @Body() dto: CreateTransactionDto) {
    try {
      return await this.transactionService.create(scope, dto);
    } catch (e: any) {
      throw bad(e, 'Failed to create transaction');
    }
  }

  @Patch(':id')
  async update(
    @ReqScope() scope: Scope,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTransactionDto>,
  ) {
    try {
      return await this.transactionService.update(scope, id, dto);
    } catch (e: any) {
      throw bad(e, 'Failed to update transaction');
    }
  }

  @Delete(':id')
  async remove(@ReqScope() scope: Scope, @Param('id') id: string) {
    try {
      return await this.transactionService.remove(scope, id);
    } catch (e: any) {
      throw bad(e, 'Failed to delete transaction');
    }
  }
}
