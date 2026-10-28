import {
  Body, Controller, Delete, Get, HttpCode, HttpException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope } from '../family/scope/scope';

/** An error that already carries a family `code` (not a member, wrong scope, forbidden…) goes out untouched. */
const coded = (e: any) => (e?.response?.code ? e : null);
const fail = (e: any, msg: string) => coded(e) ?? new HttpException(e?.message || msg, e?.status || 400);
const bad = (e: any, msg: string) => coded(e) ?? new HttpException(e?.message || msg, 400);

@Controller('wallets')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async findAll(@ReqScope() scope: Scope) {
    try {
      return await this.walletService.findAll(scope);
    } catch (e: any) {
      throw bad(e, 'Failed to fetch wallets');
    }
  }

  @Get('summary')
  async summary(@ReqScope() scope: Scope) {
    try {
      return await this.walletService.summary(scope);
    } catch (e: any) {
      throw bad(e, 'Failed to fetch summary');
    }
  }

  @Get('overview')
  async overview(@ReqScope() scope: Scope, @Query('base') base = 'RWF') {
    try { return await this.walletService.overview(scope, base.toUpperCase()); }
    catch (e: any) { throw fail(e, 'Failed to load overview'); }
  }

  @Get('flow')
  async flow(@ReqScope() scope: Scope, @Query('base') base = 'RWF', @Query('days') days = '7', @Query('walletId') walletId?: string) {
    try { return await this.walletService.dailyFlow(scope, base.toUpperCase(), Number(days), walletId); }
    catch (e: any) { throw fail(e, 'Failed to load statistics'); }
  }

  @Get('activity')
  async activity(@ReqScope() scope: Scope, @Query('limit') limit = '20', @Query('walletId') walletId?: string) {
    try { return await this.walletService.activity(scope, Number(limit), walletId); }
    catch (e: any) { throw fail(e, 'Failed to load activity'); }
  }

  /** 1 unit of each code expressed in `base`, e.g. base=RWF&codes=USD,EUR → { USD: 1450, EUR: 1580 }. */
  @Get('rates')
  async rates(@Query('base') base = 'RWF', @Query('codes') codes = 'USD,EUR,GBP,KES,UGX,TZS') {
    try { return await this.walletService.rates(base.toUpperCase(), codes.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)); }
    catch (e: any) { throw fail(e, 'Failed to load rates'); }
  }

  @Get('quote')
  async quote(@ReqScope() scope: Scope, @Query('from') from: string, @Query('to') to: string, @Query('amount') amount = '0') {
    try { return await this.walletService.quote(scope, from, to, Number(amount)); }
    catch (e: any) { throw fail(e, 'Failed to get exchange rate'); }
  }

  @Post('transfer')
  @HttpCode(201)
  async transfer(@ReqScope() scope: Scope, @Body() dto: TransferDto) {
    try { return await this.walletService.transfer(scope, dto); }
    catch (e: any) { throw fail(e, 'Transfer failed'); }
  }

  @Get(':id')
  async findOne(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.walletService.findOne(scope, id); }
    catch (e: any) { throw fail(e, 'Wallet not found'); }
  }

  @Get(':id/history')
  async history(@ReqScope() scope: Scope, @Param('id') id: string, @Query('days') days = '30') {
    try { return await this.walletService.balanceHistory(scope, id, Number(days)); }
    catch (e: any) { throw fail(e, 'Failed to load balance history'); }
  }

  @Post()
  async create(@ReqScope() scope: Scope, @Body() dto: CreateWalletDto) {
    try {
      return await this.walletService.create(scope, dto);
    } catch (e: any) {
      throw bad(e, 'Failed to create wallet');
    }
  }

  @Patch(':id')
  async update(@ReqScope() scope: Scope, @Param('id') id: string, @Body() dto: UpdateWalletDto) {
    try {
      return await this.walletService.update(scope, id, dto);
    } catch (e: any) {
      throw bad(e, 'Failed to update wallet');
    }
  }

  @Delete(':id')
  async remove(@ReqScope() scope: Scope, @Param('id') id: string) {
    try {
      return await this.walletService.remove(scope, id);
    } catch (e: any) {
      throw bad(e, 'Failed to delete wallet');
    }
  }
}
