import { Controller, Get, HttpException, Query, UseGuards } from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope } from '../family/scope/scope';
import { parseIncludeLoans } from '../../common/utils/loan-filter';
import { HomeService } from './home.service';

@Controller('home')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  /** ?month=10&year=2026&includeLoans=false (all optional: defaults to this month, loans included). */
  @Get('summary')
  async summary(
    @ReqScope() scope: Scope,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    const now = new Date();
    const m = Number(month) >= 1 && Number(month) <= 12 ? Number(month) : now.getMonth() + 1;
    const y = Number(year) >= 2000 && Number(year) <= 2100 ? Number(year) : now.getFullYear();
    try { return await this.home.summary(scope, m, y, parseIncludeLoans(includeLoans)); }
    catch (e: any) { throw e?.response?.code ? e : new HttpException(e?.message || 'Failed to load Home', e?.status || 400); }
  }
}
