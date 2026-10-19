import {
  Body, Controller, Delete, Get, HttpCode, HttpException, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { TransferDto } from './dto/transfer.dto';

const fail = (e: any, msg: string) => new HttpException(e?.message || msg, e?.status || 400);

@Controller('wallets')
@UseGuards(ClientJwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async findAll(@Req() req: RequestWithClient) {
    try {
      return await this.walletService.findAll(req.client.id);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch wallets', 400);
    }
  }

  @Get('summary')
  async summary(@Req() req: RequestWithClient) {
    try {
      return await this.walletService.summary(req.client.id);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch summary', 400);
    }
  }

  @Get('overview')
  async overview(@Req() req: RequestWithClient, @Query('base') base = 'RWF') {
    try { return await this.walletService.overview(req.client.id, base.toUpperCase()); }
    catch (e: any) { throw fail(e, 'Failed to load overview'); }
  }

  @Get('flow')
  async flow(@Req() req: RequestWithClient, @Query('base') base = 'RWF', @Query('days') days = '7', @Query('walletId') walletId?: string) {
    try { return await this.walletService.dailyFlow(req.client.id, base.toUpperCase(), Number(days), walletId); }
    catch (e: any) { throw fail(e, 'Failed to load statistics'); }
  }

  @Get('activity')
  async activity(@Req() req: RequestWithClient, @Query('limit') limit = '20', @Query('walletId') walletId?: string) {
    try { return await this.walletService.activity(req.client.id, Number(limit), walletId); }
    catch (e: any) { throw fail(e, 'Failed to load activity'); }
  }

  /** 1 unit of each code expressed in `base`, e.g. base=RWF&codes=USD,EUR → { USD: 1450, EUR: 1580 }. */
  @Get('rates')
  async rates(@Query('base') base = 'RWF', @Query('codes') codes = 'USD,EUR,GBP,KES,UGX,TZS') {
    try { return await this.walletService.rates(base.toUpperCase(), codes.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)); }
    catch (e: any) { throw fail(e, 'Failed to load rates'); }
  }

  @Get('quote')
  async quote(@Req() req: RequestWithClient, @Query('from') from: string, @Query('to') to: string, @Query('amount') amount = '0') {
    try { return await this.walletService.quote(req.client.id, from, to, Number(amount)); }
    catch (e: any) { throw fail(e, 'Failed to get exchange rate'); }
  }

  @Post('transfer')
  @HttpCode(201)
  async transfer(@Req() req: RequestWithClient, @Body() dto: TransferDto) {
    try { return await this.walletService.transfer(req.client.id, dto); }
    catch (e: any) { throw fail(e, 'Transfer failed'); }
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.walletService.findOne(req.client.id, id); }
    catch (e: any) { throw fail(e, 'Wallet not found'); }
  }

  @Get(':id/history')
  async history(@Req() req: RequestWithClient, @Param('id') id: string, @Query('days') days = '30') {
    try { return await this.walletService.balanceHistory(req.client.id, id, Number(days)); }
    catch (e: any) { throw fail(e, 'Failed to load balance history'); }
  }

  @Post()
  async create(@Req() req: RequestWithClient, @Body() dto: CreateWalletDto) {
    try {
      return await this.walletService.create(req.client.id, dto);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to create wallet', 400);
    }
  }

  @Patch(':id')
  async update(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: UpdateWalletDto) {
    try {
      return await this.walletService.update(req.client.id, id, dto);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to update wallet', 400);
    }
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithClient, @Param('id') id: string) {
    try {
      return await this.walletService.remove(req.client.id, id);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to delete wallet', 400);
    }
  }
}
