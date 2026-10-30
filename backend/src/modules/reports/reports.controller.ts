import { Controller, Get, HttpException, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope } from '../family/scope/scope';
import { parseIncludeLoans } from '../../common/utils/loan-filter';

@Controller('reports')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly')
  async monthly(
    @ReqScope() scope: Scope,
    @Query('year')   year?:   string,
    @Query('months') months?: string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.monthly(
        scope,
        year ? Number(year) : now.getFullYear(),
        months ? Number(months) : 6,
        parseIncludeLoans(includeLoans),
      );
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch monthly report', 400);
    }
  }

  /** Who spent and who earned what in the period (in a family, every member; in Personal, just you). */
  @Get('by-member')
  async byMember(
    @ReqScope() scope: Scope,
    @Query('month')     month?:     string,
    @Query('year')      year?:      string,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?:   string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.byMember(scope, month ? Number(month) : now.getMonth() + 1, year ? Number(year) : now.getFullYear(), startDate, endDate, parseIncludeLoans(includeLoans));
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch spending by member', 400);
    }
  }

  @Get('by-category')
  async byCategory(
    @ReqScope() scope: Scope,
    @Query('month')     month?:     string,
    @Query('year')      year?:      string,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?:   string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.byCategory(
        scope,
        month ? Number(month) : now.getMonth() + 1,
        year  ? Number(year)  : now.getFullYear(),
        startDate,
        endDate,
        parseIncludeLoans(includeLoans),
      );
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch category breakdown', 400);
    }
  }

  @Get('summary')
  async summary(
    @ReqScope() scope: Scope,
    @Query('month')     month?:     string,
    @Query('year')      year?:      string,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?:   string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.summary(
        scope,
        month ? Number(month) : now.getMonth() + 1,
        year  ? Number(year)  : now.getFullYear(),
        startDate,
        endDate,
        parseIncludeLoans(includeLoans),
      );
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch summary', 400);
    }
  }

  @Get('top-expenses')
  async topExpenses(
    @ReqScope() scope: Scope,
    @Query('month') month?: string,
    @Query('year')  year?:  string,
    @Query('limit') limit?: string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.topExpenses(
        scope,
        month ? Number(month) : now.getMonth() + 1,
        year  ? Number(year)  : now.getFullYear(),
        limit ? Number(limit) : 4,
        parseIncludeLoans(includeLoans),
      );
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch top expenses', 400);
    }
  }

  @Get('ai-advice')
  async aiAdvice(
    @ReqScope() scope: Scope,
    @Query('month')     month?:     string,
    @Query('year')      year?:      string,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?:   string,
    @Query('currency')  currency?:  string,
    @Query('includeLoans') includeLoans?: string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.aiAdvice(
        scope,
        month ? Number(month) : now.getMonth() + 1,
        year  ? Number(year)  : now.getFullYear(),
        startDate,
        endDate,
        currency,
        parseIncludeLoans(includeLoans),
      );
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(e.message || 'Failed to get AI advice', 500);
    }
  }
}
