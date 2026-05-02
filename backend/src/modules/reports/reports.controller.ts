import { Controller, Get, HttpException, Query, Req, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';

@Controller('reports')
@UseGuards(ClientJwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly')
  async monthly(
    @Req() req: RequestWithClient,
    @Query('year')   year?:   string,
    @Query('months') months?: string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.monthly(
        req.client.id,
        year ? Number(year) : now.getFullYear(),
        months ? Number(months) : 6,
      );
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch monthly report', 400);
    }
  }

  @Get('by-category')
  async byCategory(
    @Req() req: RequestWithClient,
    @Query('month')     month?:     string,
    @Query('year')      year?:      string,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?:   string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.byCategory(
        req.client.id,
        month ? Number(month) : now.getMonth() + 1,
        year  ? Number(year)  : now.getFullYear(),
        startDate,
        endDate,
      );
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch category breakdown', 400);
    }
  }

  @Get('summary')
  async summary(
    @Req() req: RequestWithClient,
    @Query('month')     month?:     string,
    @Query('year')      year?:      string,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?:   string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.summary(
        req.client.id,
        month ? Number(month) : now.getMonth() + 1,
        year  ? Number(year)  : now.getFullYear(),
        startDate,
        endDate,
      );
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch summary', 400);
    }
  }

  @Get('top-expenses')
  async topExpenses(
    @Req() req: RequestWithClient,
    @Query('month') month?: string,
    @Query('year')  year?:  string,
    @Query('limit') limit?: string,
  ) {
    try {
      const now = new Date();
      return await this.reportsService.topExpenses(
        req.client.id,
        month ? Number(month) : now.getMonth() + 1,
        year  ? Number(year)  : now.getFullYear(),
        limit ? Number(limit) : 4,
      );
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to fetch top expenses', 400);
    }
  }
}
