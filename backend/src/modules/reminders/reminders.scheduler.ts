import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RemindersService } from './reminders.service';

/**
 * Runs the engine inside the server: every minute, plus once shortly after start-up to catch up on
 * anything that came due while the server slept. Set REMINDERS_DISABLED=true to turn it off
 * (for example on a second copy of the server).
 */
@Injectable()
export class RemindersScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RemindersScheduler.name);
  private running = false;
  private warnedMissingTables = false;

  constructor(private readonly reminders: RemindersService) {}

  private get disabled() { return process.env.REMINDERS_DISABLED === 'true'; }

  onApplicationBootstrap() {
    if (this.disabled) { this.logger.warn('Reminders are disabled (REMINDERS_DISABLED=true)'); return; }
    // Give the database connection a moment, then catch up. A long outage fires each reminder once, not in a burst.
    const t = setTimeout(() => { void this.everyMinute(); }, 5_000);
    t.unref?.();
  }

  @Cron('* * * * *')
  async everyMinute() {
    if (this.disabled || this.running) return;     // never overlap two runs
    this.running = true;
    try {
      const s = await this.reminders.tick();
      if (s.claimed) this.logger.log(`tick: ${JSON.stringify(s)}`);
    } catch (e: any) {
      this.report('tick', e);
    } finally {
      this.running = false;
    }
  }

  @Cron('*/5 * * * *')
  async receipts() {
    if (this.disabled) return;
    try {
      const r = await this.reminders.checkReceipts();
      if (r.checked) this.logger.log(`receipts: ${JSON.stringify(r)}`);
    } catch (e: any) {
      this.report('receipt check', e);
    }
  }

  /** A database that has not been migrated yet gets one clear message, not an error every minute. */
  private report(what: string, e: any) {
    const missing = e?.code === 'P2021' || /does not exist in the current database/i.test(String(e?.message));
    if (!missing) { this.logger.error(`${what} failed: ${e?.message ?? e}`); return; }
    if (this.warnedMissingTables) return;
    this.warnedMissingTables = true;
    this.logger.warn('Reminder tables are missing in this database. Run "npx prisma migrate deploy" in the backend folder; reminders stay idle until then.');
  }

}
