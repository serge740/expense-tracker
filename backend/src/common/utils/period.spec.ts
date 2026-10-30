import { dateFilter, parsePeriod, periodOrThisMonth } from './period';

const NOW = new Date(2026, 9, 29, 10, 0, 0); // 29 Oct 2026

describe('parsePeriod', () => {
  it('asks for nothing: null (and this month through periodOrThisMonth)', () => {
    expect(parsePeriod({}, NOW)).toBeNull();
    const p = periodOrThisMonth({}, NOW);
    expect(p.kind).toBe('month');
    expect(p.from).toEqual(new Date(2026, 9, 1));
    expect(p.to).toEqual(new Date(2026, 10, 1));
  });

  it('a month and a year', () => {
    const p = parsePeriod({ month: '2', year: '2026' }, NOW)!;
    expect(p).toMatchObject({ kind: 'month', month: 2, year: 2026 });
    expect(p.to).toEqual(new Date(2026, 2, 1));
  });

  it('a year alone covers the whole year, and December rolls into the next one', () => {
    const p = parsePeriod({ year: '2025' }, NOW)!;
    expect(p.kind).toBe('year');
    expect(p.from).toEqual(new Date(2025, 0, 1));
    expect(p.to).toEqual(new Date(2026, 0, 1));
    expect(parsePeriod({ month: '12', year: '2026' }, NOW)!.to).toEqual(new Date(2027, 0, 1));
  });

  it('all has no limits at all', () => {
    const p = parsePeriod({ all: 'true' }, NOW)!;
    expect(p.kind).toBe('all');
    expect(dateFilter(p)).toEqual({});
  });

  it('a custom range includes its last day', () => {
    const p = parsePeriod({ from: '2026-10-05', to: '2026-10-09' }, NOW)!;
    expect(p.kind).toBe('range');
    expect(p.from).toEqual(new Date(2026, 9, 5));
    expect(p.to).toEqual(new Date(2026, 9, 10));
    expect(dateFilter(p)).toEqual({ gte: new Date(2026, 9, 5), lt: new Date(2026, 9, 10) });
  });

  it('one day is a range of one day', () => {
    const p = parsePeriod({ from: '2026-02-28', to: '2026-02-28' }, NOW)!;
    expect(p.to).toEqual(new Date(2026, 2, 1));
  });

  it.each([
    ['an impossible date', { from: '2026-02-31', to: '2026-03-02' }],
    ['a start after the end', { from: '2026-10-09', to: '2026-10-05' }],
    ['junk', { from: 'yesterday', to: 'today' }],
    ['a month without a good year', { month: '5', year: '1999' }],
    ['a bad month', { month: '13', year: '2026' }],
    ['a span over twenty years', { from: '2000-01-01', to: '2026-01-01' }],
  ])('ignores %s', (_n, q) => {
    expect(parsePeriod(q as any, NOW)).toBeNull();
  });
});
