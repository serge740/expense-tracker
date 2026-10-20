import {
  Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@Controller('transactions')
@UseGuards(ClientJwtAuthGuard)
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  async findAll(@Req() req: RequestWithClient, @Query() query: QueryTransactionDto) {
    try {
      const parsed: QueryTransactionDto = {
        ...query,
        page:  query.page  ? Number(query.page)  : 1,
        limit: query.limit ? Number(query.limit) : 20,
        month: query.month ? Number(query.month) : undefined,
        year:  query.year  ? Number(query.year)  : undefined,
      };
      return await this.transactionService.findAll(req.client.id, parsed);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch transactions', 400);
    }
  }

  @Get('recent')
  async findRecent(@Req() req: RequestWithClient, @Query('limit') limit?: string) {
    try {
      return await this.transactionService.findRecent(req.client.id, limit ? Number(limit) : 3);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch recent transactions', 400);
    }
  }

  @Get('history')
  async history(@Req() req: RequestWithClient, @Query() query: QueryTransactionDto) {
    try {
      const parsed: QueryTransactionDto = {
        ...query,
        month: query.month ? Number(query.month) : undefined,
        year:  query.year  ? Number(query.year)  : undefined,
      };
      return await this.transactionService.history(req.client.id, parsed);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch history', 400);
    }
  }

  @Post()
  async create(@Req() req: RequestWithClient, @Body() dto: CreateTransactionDto) {
    try {
      return await this.transactionService.create(req.client.id, dto);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to create transaction', 400);
    }
  }

  @Patch(':id')
  async update(
    @Req() req: RequestWithClient,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTransactionDto>,
  ) {
    try {
      return await this.transactionService.update(req.client.id, id, dto);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to update transaction', 400);
    }
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithClient, @Param('id') id: string) {
    try {
      return await this.transactionService.remove(req.client.id, id);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to delete transaction', 400);
    }
  }
}
