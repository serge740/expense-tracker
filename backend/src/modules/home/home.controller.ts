import { Controller, Get, HttpException, Query, Req, UseGuards } from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { parseIncludeLoans } from '../../common/utils/loan-filter';
import { HomeService } from './home.service';

@Controller('home')
@UseGuards(ClientJwtAuthGuard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  /** ?month=10&year=2026&includeLoans=false (all optional: defaults to this month, loans included). */
  @Get('summary')
  async summary(
    @Req() req: RequestWithClient,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    const now = new Date();
    const m = Number(month) >= 1 && Number(month) <= 12 ? Number(month) : now.getMonth() + 1;
    const y = Number(year) >= 2000 && Number(year) <= 2100 ? Number(year) : now.getFullYear();
    try { return await this.home.summary(req.client.id, m, y, parseIncludeLoans(includeLoans)); }
    catch (e: any) { throw new HttpException(e?.message || 'Failed to load Home', e?.status || 400); }
  }
}
