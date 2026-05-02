import {
  Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';

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
