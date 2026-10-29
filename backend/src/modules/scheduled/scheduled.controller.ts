import { PersonalOnlyGuard } from '../family/scope/personal-only.guard';
import {
  Body, Controller, Delete, Get, HttpCode, HttpException, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { ScheduledService } from './scheduled.service';
import { ConfirmOccurrenceDto, CreateScheduledDto, UpdateScheduledDto } from './dto/scheduled.dto';

const fail = (e: any, msg: string) => new HttpException(e?.message || msg, e?.status || 400);

@Controller('scheduled')
@UseGuards(ClientJwtAuthGuard, PersonalOnlyGuard)
export class ScheduledController {
  constructor(private readonly scheduled: ScheduledService) {}

  @Get()
  async list(@Req() req: RequestWithClient, @Query('status') status?: string) {
    try { return await this.scheduled.list(req.client.id, status); } catch (e) { throw fail(e, 'Failed to load scheduled transactions'); }
  }

  /** Dates waiting for an answer (due now or within a day), across every schedule. */
  @Get('waiting')
  async waiting(@Req() req: RequestWithClient) {
    try { return await this.scheduled.waiting(req.client.id); } catch (e) { throw fail(e, 'Failed to load'); }
  }

  @Post('occurrences/:id/confirm')
  @HttpCode(200)
  async confirm(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: ConfirmOccurrenceDto) {
    try { return await this.scheduled.confirm(req.client.id, id, dto ?? {}); } catch (e) { throw fail(e, 'Could not post'); }
  }

  @Post('occurrences/:id/skip')
  @HttpCode(200)
  async skip(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.scheduled.skip(req.client.id, id); } catch (e) { throw fail(e, 'Could not skip'); }
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.scheduled.findOne(req.client.id, id); } catch (e) { throw fail(e, 'Not found'); }
  }

  @Post()
  async create(@Req() req: RequestWithClient, @Body() dto: CreateScheduledDto) {
    try { return await this.scheduled.create(req.client.id, dto); } catch (e) { throw fail(e, 'Could not schedule'); }
  }

  @Patch(':id')
  async update(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: UpdateScheduledDto) {
    try { return await this.scheduled.update(req.client.id, id, dto); } catch (e) { throw fail(e, 'Could not update'); }
  }

  @Post(':id/pause')
  @HttpCode(200)
  async pause(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.scheduled.pause(req.client.id, id); } catch (e) { throw fail(e, 'Could not pause'); }
  }

  @Post(':id/resume')
  @HttpCode(200)
  async resume(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.scheduled.resume(req.client.id, id); } catch (e) { throw fail(e, 'Could not resume'); }
  }

  /** Ends the schedule. Transactions it already posted stay. */
  @Delete(':id')
  async end(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.scheduled.end(req.client.id, id); } catch (e) { throw fail(e, 'Could not end'); }
  }
}
