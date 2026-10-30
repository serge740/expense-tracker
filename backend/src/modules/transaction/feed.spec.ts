import { changePercent, decodeCursor, encodeCursor, parseFeedFilter, previousPeriod, seriesSpan, totalsByCurrency, type SumRow } from './feed';
import { parsePeriod } from '../../common/utils/period';

const NOW = new Date(2026, 9, 29, 10, 0, 0);

describe('parseFeedFilter', () => {
  it('asks for nothing: all kinds, all time, loans in, 40 rows', () => {
    const f = parseFeedFilter({}, NOW);
    expect(f).toMatchObject({ period: null, kinds: [], includeLoans: true, walletIds: [], memberId: null, search: null, limit: 40, cursor: null, fallbackCurrency: 'RWF', convertTo: null });
  });

  it('reads a period, a kind, wallets and the loans switch', () => {
    const f = parseFeedFilter({ month: '10', year: '2026', view: 'transfer', walletIds: 'a1, b2,a1', includeLoans: 'false', fallbackCurrency: 'usd', convertTo: 'rwf' }, NOW);
    expect(f.period).toMatchObject({ kind: 'month', month: 10, year: 2026 });
    expect(f.kinds).toEqual(['transfer']);
    expect(f.walletIds).toEqual(['a1', 'b2']);
    expect(f.includeLoans).toBe(false);
    expect(f.fallbackCurrency).toBe('USD');
    expect(f.convertTo).toBe('RWF');
  });

  it.each([
    ['an unknown kind', { view: 'bogus' }, 'kinds', []],
    ['a silly page size', { limit: '100000' }, 'limit', 100],
    ['a negative page size', { limit: '-4' }, 'limit', 40],
    ['a bad currency', { fallbackCurrency: 'dollars' }, 'fallbackCurrency', 'RWF'],
  ])('ignores %s', (_n, q, key, expected) => {
    expect((parseFeedFilter(q as never, NOW) as never)[key]).toEqual(expected);
  });

  it('drops wallet ids that are not plain ids, and caps the list', () => {
    const f = parseFeedFilter({ walletIds: `ok, bad id!, ${'x'.repeat(65)}, ../etc` }, NOW);
    expect(f.walletIds).toEqual(['ok']);
    expect(parseFeedFilter({ walletIds: Array.from({ length: 80 }, (_, i) => `w${i}`).join(',') }, NOW).walletIds).toHaveLength(50);
  });
});

describe('cursor', () => {
  it('round-trips', () => {
    const row = { date: new Date('2026-10-29T08:00:00.000Z'), id: 'abc-123' };
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
  });
  it.each([[null], [''], ['not base64 json'], [Buffer.from('{"d":"nope","i":"x"}').toString('base64url')], [Buffer.from('{"d":"2026-01-01","i":5}').toString('base64url')]])('refuses %p', raw => {
    expect(decodeCursor(raw as never)).toBeNull();
  });
});

describe('previousPeriod', () => {
  it('a month goes back one month, across the new year', () => {
    const p = previousPeriod(parsePeriod({ month: '1', year: '2026' }, NOW))!;
    expect(p).toMatchObject({ kind: 'month', month: 12, year: 2025 });
    expect(p.from).toEqual(new Date(2025, 11, 1));
    expect(p.to).toEqual(new Date(2026, 0, 1));
  });
  it('a year goes back one year', () => {
    const p = previousPeriod(parsePeriod({ year: '2026' }, NOW))!;
    expect(p.from).toEqual(new Date(2025, 0, 1));
    expect(p.to).toEqual(new Date(2026, 0, 1));
  });
  it('a range goes back by its own length', () => {
    const p = previousPeriod(parsePeriod({ from: '2026-10-05', to: '2026-10-11' }, NOW))!;
    expect(p.from).toEqual(new Date(2026, 9, 5 - 7));
    expect(p.to).toEqual(new Date(2026, 9, 5));
  });
  it('all time and no period have none', () => {
    expect(previousPeriod(parsePeriod({ all: 'true' }, NOW))).toBeNull();
    expect(previousPeriod(null)).toBeNull();
  });
});

describe('totalsByCurrency', () => {
  const row = (type: SumRow['type'], amount: number, currency: string, day: number, debtRole: string | null = null): SumRow => ({ type, amount, currency, date: new Date(2026, 9, day, 12), debtRole });
  const span = { from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) };

  it('keeps currencies apart and counts every row', () => {
    const t = totalsByCurrency([row('INCOME', 1000, 'RWF', 3), row('EXPENSE', 400, 'RWF', 4), row('EXPENSE', 30, 'USD', 5), row('TRANSFER', 500, 'RWF', 6)], span);
    expect(t.map(x => x.currency)).toEqual(['RWF', 'USD']);
    expect(t[0]).toMatchObject({ income: 1000, expense: 400, net: 600, count: 3 });
    expect(t[1]).toMatchObject({ income: 0, expense: 30, net: -30, count: 1 });
  });

  it('borrowed money is never income, and a transfer is neither income nor spending', () => {
    const t = totalsByCurrency([row('INCOME', 200_000, 'RWF', 2, 'BORROW_IN'), row('INCOME', 30_000, 'RWF', 3, 'REPAY_IN'), row('EXPENSE', 40_000, 'RWF', 4, 'REPAY_OUT'), row('TRANSFER', 9, 'RWF', 5)], span)[0];
    expect(t.income).toBe(30_000);
    expect(t.expense).toBe(40_000);
    expect(t.count).toBe(4);
  });

  it('puts spending in equal slices of the period for the trend line', () => {
    const t = totalsByCurrency([row('EXPENSE', 10, 'RWF', 1), row('EXPENSE', 5, 'RWF', 1), row('EXPENSE', 7, 'RWF', 30)], span, 12)[0];
    expect(t.series).toHaveLength(12);
    expect(t.series[0]).toBe(15);
    expect(t.series[11]).toBe(7);
    expect(t.series.reduce((a, b) => a + b, 0)).toBe(22);
  });

  it('rounds to cents and orders the busiest currency first', () => {
    const t = totalsByCurrency([row('EXPENSE', 0.1, 'USD', 1), row('EXPENSE', 0.2, 'USD', 2), row('EXPENSE', 1, 'RWF', 3), row('EXPENSE', 1, 'RWF', 4), row('EXPENSE', 1, 'RWF', 5)], span);
    expect(t[0].currency).toBe('RWF');
    expect(t[1].expense).toBe(0.3);
  });

  it('no rows, no currencies', () => {
    expect(totalsByCurrency([], span)).toEqual([]);
  });
});

describe('changePercent and seriesSpan', () => {
  it('compares with the period before', () => {
    expect(changePercent(123, 100)).toBe(23);
    expect(changePercent(50, 100)).toBe(-50);
    expect(changePercent(10, 0)).toBeNull();
  });
  it('the trend span is the period, cut at now; for all time it starts at the oldest row', () => {
    const month = parsePeriod({ month: '10', year: '2026' }, NOW)!;
    expect(seriesSpan(month, null, NOW)!.to.getTime()).toBeGreaterThan(NOW.getTime());
    const past = parsePeriod({ month: '3', year: '2026' }, NOW)!;
    expect(seriesSpan(past, null, NOW)).toEqual({ from: past.from, to: past.to });
    expect(seriesSpan(null, new Date(2024, 0, 1), NOW)!.from).toEqual(new Date(2024, 0, 1));
    expect(seriesSpan(null, null, NOW)).toBeNull();
  });
});
