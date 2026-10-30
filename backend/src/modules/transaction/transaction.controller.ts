import {
  Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionFeedService } from './transaction-feed.service';
import { SavedViewsService } from './saved-views.service';
import { TrashService, type BulkBody } from './trash.service';
import { parseFeedFilter, type FeedQuery } from './feed';
import { parsePeriod } from '../../common/utils/period';
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
  constructor(private readonly transactionService: TransactionService, private readonly feedService: TransactionFeedService, private readonly views: SavedViewsService, private readonly trash: TrashService) {}

  /** History: a page of rows (newest first, transfers included) and where the next page starts. */
  @Get('feed')
  async feed(@ReqScope() scope: Scope, @Query() query: FeedQuery) {
    try { return await this.feedService.feed(scope, parseFeedFilter(query)); }
    catch (e: any) { throw bad(e, 'Failed to load History'); }
  }

  /** History as a CSV (what the filter shows, up to 5,000 rows). */
  @Get('export')
  async export(@ReqScope() scope: Scope, @Query() query: FeedQuery) {
    try { return await this.feedService.exportCsv(scope, parseFeedFilter(query)); }
    catch (e: any) { throw bad(e, 'Failed to export'); }
  }

  /** The same rows as a spreadsheet (format=xlsx) or a PDF (format=pdf), as base64. */
  @Get('export/file')
  async exportFile(@ReqScope() scope: Scope, @Query() query: FeedQuery & { format?: string }) {
    try { return await this.feedService.exportFile(scope, parseFeedFilter(query), query.format === 'pdf' ? 'pdf' : 'xlsx'); }
    catch (e: any) { throw bad(e, 'Failed to export'); }
  }

  /** Tags in use here, most used first. */
  @Get('tags')
  async tags(@ReqScope() scope: Scope) {
    try { return await this.feedService.tagsInUse(scope); } catch (e: any) { throw bad(e, 'Failed to load tags'); }
  }

  /** Rows that look like the same payment entered twice, grouped to compare. */
  @Get('duplicates')
  async duplicates(@ReqScope() scope: Scope) {
    try { return await this.feedService.duplicateGroups(scope); } catch (e: any) { throw bad(e, 'Failed to load duplicates'); }
  }

  @Post('duplicates/keep')
  async keepDuplicates(@ReqScope() scope: Scope, @Body() body: { ids?: unknown }) {
    try { return await this.feedService.keepDuplicates(scope, body?.ids); } catch (e: any) { throw bad(e, 'Failed to save'); }
  }

  /** History in one wallet: opening, money in, money out, closing and whether they add up. */
  @Get('statement')
  async statement(@ReqScope() scope: Scope, @Query() query: FeedQuery) {
    try {
      const f = parseFeedFilter(query);
      if (f.walletIds.length !== 1) throw new HttpException('Choose one wallet', 400);
      return await this.feedService.statement(scope, f.walletIds[0], f);
    } catch (e: any) { throw e instanceof HttpException ? e : bad(e, 'Failed to load the statement'); }
  }

  /** History: one header per category, wallet, member or title, with totals for the whole filter. */
  @Get('groups')
  async groups(@ReqScope() scope: Scope, @Query() query: FeedQuery) {
    try { return await this.feedService.groups(scope, parseFeedFilter(query)); }
    catch (e: any) { throw bad(e, 'Failed to load the groups'); }
  }

  /** History search: titles used before and the people a person has loans with. */
  @Get('suggest')
  async suggest(@ReqScope() scope: Scope, @Query('q') q?: string) {
    try { return await this.feedService.suggest(scope, q ?? ''); }
    catch (e: any) { throw bad(e, 'Failed to load suggestions'); }
  }

  /** Recently deleted: the last 30 days, with Restore and Delete forever. */
  @Get('trash')
  async listTrash(@ReqScope() scope: Scope) {
    try { return await this.trash.list(scope); } catch (e: any) { throw e instanceof HttpException ? e : bad(e, 'Failed to load Recently deleted'); }
  }

  @Post('trash/:id/restore')
  async restoreTrash(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.trash.restore(scope, id); } catch (e: any) { throw e instanceof HttpException ? e : bad(e, 'Failed to restore'); }
  }

  @Delete('trash/:id')
  async purgeTrash(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.trash.purge(scope, id); } catch (e: any) { throw e instanceof HttpException ? e : bad(e, 'Failed to delete'); }
  }

  /** Select mode in History: delete, change category or move wallet for several rows; each row stands alone. */
  @Post('bulk')
  async bulk(@ReqScope() scope: Scope, @Body() body: BulkBody) {
    try { return await this.trash.bulk(scope, body); } catch (e: any) { throw e instanceof HttpException ? e : bad(e, 'Failed to apply the change'); }
  }

  @Get('views')
  async listViews(@ReqScope() scope: Scope) {
    try { return await this.views.list(scope); } catch (e: any) { throw bad(e, 'Failed to load saved views'); }
  }

  @Post('views')
  async createView(@ReqScope() scope: Scope, @Body() body: unknown) {
    try { return await this.views.create(scope, body); } catch (e: any) { throw e instanceof HttpException ? e : bad(e, 'Failed to save the view'); }
  }

  @Patch('views/:id')
  async renameView(@ReqScope() scope: Scope, @Param('id') id: string, @Body() body: unknown) {
    try { return await this.views.rename(scope, id, body); } catch (e: any) { throw e instanceof HttpException ? e : bad(e, 'Failed to rename the view'); }
  }

  @Delete('views/:id')
  async removeView(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.views.remove(scope, id); } catch (e: any) { throw e instanceof HttpException ? e : bad(e, 'Failed to remove the view'); }
  }

  /** History: the used categories and sub-categories with counts that follow the other filters. */
  @Get('facets')
  async facets(@ReqScope() scope: Scope, @Query() query: FeedQuery) {
    try { return await this.feedService.facets(scope, parseFeedFilter(query)); }
    catch (e: any) { throw bad(e, 'Failed to load the filter counts'); }
  }

  /** History: totals for everything the filter matches, per currency, with the change since the period before. */
  @Get('summary')
  async summary(@ReqScope() scope: Scope, @Query() query: FeedQuery) {
    try { return await this.feedService.summary(scope, parseFeedFilter(query)); }
    catch (e: any) { throw bad(e, 'Failed to load the totals'); }
  }

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
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('all') all?: string,
  ) {
    try {
      return await this.transactionService.findRecent(scope, limit ? Number(limit) : 3, view, includeLoans, parsePeriod({ month, year, from, to, all }));
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

  @Get(':id/annotate')
  async annotation(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.feedService.annotation(scope, id); } catch (e: any) { throw bad(e, 'Not found'); }
  }

  /** Tags and the private note of one row (no money moves, so it works on any row you may edit). */
  @Patch(':id/annotate')
  async annotate(@ReqScope() scope: Scope, @Param('id') id: string, @Body() body: { tags?: unknown; note?: unknown }) {
    try { return await this.feedService.annotate(scope, id, body ?? {}); } catch (e: any) { throw bad(e, 'Failed to save'); }
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
