import { Injectable, Logger } from '@nestjs/common';

type Cache = { base: string; rates: Record<string, number>; fetchedAt: number };

/**
 * Live FX rates from open.er-api.com (free, no key), cached for 6 hours.
 * All conversions go through USD so one fetch serves every currency pair.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private cache: Cache | null = null;
  private static readonly TTL = 6 * 60 * 60 * 1000;

  private async usdRates(): Promise<Record<string, number> | null> {
    if (this.cache && Date.now() - this.cache.fetchedAt < ExchangeRateService.TTL) return this.cache.rates;
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (json.result !== 'success' || !json.rates) throw new Error('bad response');
      this.cache = { base: 'USD', rates: json.rates, fetchedAt: Date.now() };
      return json.rates;
    } catch (err: any) {
      this.logger.warn(`FX fetch failed: ${err?.message ?? err}`);
      return this.cache?.rates ?? null; // stale beats nothing
    }
  }

  /** Rate to convert 1 unit of `from` into `to`, or null if unknown. */
  async rate(from: string, to: string): Promise<number | null> {
    if (from === to) return 1;
    const r = await this.usdRates();
    if (!r?.[from] || !r?.[to]) return null;
    return r[to] / r[from];
  }

  /** Rates from `base` to each of `codes` (missing ones are omitted). */
  async ratesFor(base: string, codes: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const c of new Set(codes)) {
      const v = await this.rate(c, base);
      if (v !== null) out[c] = v;
    }
    return out;
  }

  get updatedAt(): number | null {
    return this.cache?.fetchedAt ?? null;
  }
}
