import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope } from '../family/scope/scope';
import {
  Body, Controller, Delete, Get, HttpCode, HttpException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { ScheduledService } from './scheduled.service';
import { ConfirmOccurrenceDto, CreateScheduledDto, UpdateScheduledDto } from './dto/scheduled.dto';

/** An error that already carries a family `code` (not a member, forbidden…) goes out untouched. */
const fail = (e: any, msg: string) => (e?.response?.code ? e : new HttpException(e?.message || msg, e?.status || 400));

@Controller('scheduled')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class ScheduledController {
  constructor(private readonly scheduled: ScheduledService) {}

  @Get()
  async list(@ReqScope() scope: Scope, @Query('status') status?: string) {
    try { return await this.scheduled.list(scope, status); } catch (e) { throw fail(e, 'Failed to load scheduled transactions'); }
  }

  /** Dates waiting for an answer (due now or within a day), across every schedule. */
  @Get('waiting')
  async waiting(@ReqScope() scope: Scope) {
    try { return await this.scheduled.waiting(scope); } catch (e) { throw fail(e, 'Failed to load'); }
  }

  @Post('occurrences/:id/confirm')
  @HttpCode(200)
  async confirm(@ReqScope() scope: Scope, @Param('id') id: string, @Body() dto: ConfirmOccurrenceDto) {
    try { return await this.scheduled.confirm(scope, id, dto ?? {}); } catch (e) { throw fail(e, 'Could not post'); }
  }

  @Post('occurrences/:id/skip')
  @HttpCode(200)
  async skip(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.scheduled.skip(scope, id); } catch (e) { throw fail(e, 'Could not skip'); }
  }

  @Get(':id')
  async findOne(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.scheduled.findOne(scope, id); } catch (e) { throw fail(e, 'Not found'); }
  }

  @Post()
  async create(@ReqScope() scope: Scope, @Body() dto: CreateScheduledDto) {
    try { return await this.scheduled.create(scope, dto); } catch (e) { throw fail(e, 'Could not schedule'); }
  }

  @Patch(':id')
  async update(@ReqScope() scope: Scope, @Param('id') id: string, @Body() dto: UpdateScheduledDto) {
    try { return await this.scheduled.update(scope, id, dto); } catch (e) { throw fail(e, 'Could not update'); }
  }

  @Post(':id/pause')
  @HttpCode(200)
  async pause(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.scheduled.pause(scope, id); } catch (e) { throw fail(e, 'Could not pause'); }
  }

  @Post(':id/resume')
  @HttpCode(200)
  async resume(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.scheduled.resume(scope, id); } catch (e) { throw fail(e, 'Could not resume'); }
  }

  /** Ends the schedule. Transactions it already posted stay. */
  @Delete(':id')
  async end(@ReqScope() scope: Scope, @Param('id') id: string) {
    try { return await this.scheduled.end(scope, id); } catch (e) { throw fail(e, 'Could not end'); }
  }
}
