import { PersonalOnlyGuard } from '../family/scope/personal-only.guard';
import {
  Body, Controller, Get, HttpCode, HttpException, NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { RemindersService } from './reminders.service';

const fail = (e: any, msg: string) => new HttpException(e?.message || msg, e?.status || 400);

@Controller('reminders')
@UseGuards(ClientJwtAuthGuard, PersonalOnlyGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  /** Reminders that fired and still wait for you: what the in-app popup shows. */
  @Get('pending')
  async pending(@Req() req: RequestWithClient) {
    try { return await this.reminders.pending(req.client.id); } catch (e) { throw fail(e, 'Failed to load reminders'); }
  }

  /** Body: { minutes: 10 | 30 | 60 | 1440 | 10080 } or { until: ISO date-time } for a custom time. */
  @Post(':id/snooze')
  @HttpCode(200)
  async snooze(@Req() req: RequestWithClient, @Param('id') id: string, @Body() body: { minutes?: number; until?: string }) {
    try { return await this.reminders.snooze(req.client.id, id, body ?? {}); } catch (e) { throw fail(e, 'Could not snooze'); }
  }

  @Post(':id/wake')
  @HttpCode(200)
  async wake(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.reminders.wake(req.client.id, id); } catch (e) { throw fail(e, 'Could not wake'); }
  }

  @Post(':id/done')
  @HttpCode(200)
  async done(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.reminders.done(req.client.id, id); } catch (e) { throw fail(e, 'Could not complete'); }
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  async dismiss(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.reminders.dismiss(req.client.id, id); } catch (e) { throw fail(e, 'Could not dismiss'); }
  }

  @Post(':id/opened')
  @HttpCode(200)
  async opened(@Req() req: RequestWithClient, @Param('id') id: string) {
    try { return await this.reminders.opened(req.client.id, id); } catch (e) { throw fail(e, 'Could not log'); }
  }
}

/**
 * A backup trigger for an uptime monitor (e.g. UptimeRobot, every 10 min) in case the in-process
 * scheduler is asleep. No login: protected by REMINDER_TICK_KEY in the URL. Without the variable the
 * route does not exist. Firing is idempotent, so calling it often is harmless.
 */
@Controller('reminders')
export class RemindersTickController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('tick')
  async tick(@Query('key') key?: string) {
    const expected = process.env.REMINDER_TICK_KEY;
    if (!expected || !key) throw new NotFoundException();
    // Compare fixed-length digests so the check takes the same time wherever the keys differ.
    const a = createHash('sha256').update(key).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(a, b)) throw new NotFoundException();
    const [fired, receipts] = [await this.reminders.tick(), await this.reminders.checkReceipts()];
    return { ok: true, fired, receipts };
  }
}
