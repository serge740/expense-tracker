import { Controller, Get, HttpException, Query, UseGuards } from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope, isFamily } from '../family/scope/scope';
import { parseIncludeLoans } from '../../common/utils/loan-filter';
import { periodOrThisMonth } from '../../common/utils/period';
import { HomeService } from './home.service';
import { AgendaService } from './agenda.service';

@Controller('home')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class HomeController {
  constructor(private readonly home: HomeService, private readonly agenda: AgendaService) {}

  /**
   * The period is one of: ?month=10&year=2026, ?year=2026, ?all=true, or ?from=2026-10-05&to=2026-10-09 (both days included).
   * Nothing means this month. ?includeLoans=false leaves loan rows out. All optional.
   */
  @Get('summary')
  async summary(
    @ReqScope() scope: Scope,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('all') all?: string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    try { return await this.home.summaryFor(scope, periodOrThisMonth({ month, year, from, to, all }), parseIncludeLoans(includeLoans)); }
    catch (e: any) { throw e?.response?.code ? e : new HttpException(e?.message || 'Failed to load Home', e?.status || 400); }
  }

  /** What is coming: scheduled items and loan / credit pay dates in one list. Personal only; a family has none. */
  @Get('agenda')
  async upcoming(@ReqScope() scope: Scope) {
    try { return await this.agenda.build(scope); }
    catch (e: any) { throw e?.response?.code ? e : new HttpException(e?.message || 'Failed to load the agenda', e?.status || 400); }
  }
}
