import { deriveInstallments, finalDeadline, InstallmentInput, isOverdue, nextUnpaid } from './debt-installments';

const at = (m: number, d: number, h = 18) => new Date(2026, m, d, h);
const NOW = new Date(2026, 9, 20, 15); // Mon 20 Oct 2026, 3 pm
const row = (id: string, due: Date, planned: number | null, status: InstallmentInput['status'] = 'PENDING'): InstallmentInput =>
  ({ id, dueAt: due, plannedAmount: planned, status });
const views = (r: ReturnType<typeof deriveInstallments>) => Object.fromEntries(r.map(x => [x.id, x.view]));

describe('debt installments', () => {
  const rows = [row('a', at(9, 15), 50_000), row('b', at(9, 20), 50_000), row('c', at(9, 25, 9), 100_000, 'MOVED'), row('d', at(10, 2, 9), 100_000)];
  const run = (paid: number, list = rows) => deriveInstallments({ amount: 200_000, writtenOff: 0, paid, installments: list, now: NOW });

  it('payments fill the oldest pay date first', () => {
    expect(views(run(50_000))).toEqual({ a: 'PAID', b: 'UPCOMING', c: 'MOVED', d: 'UPCOMING' });
  });

  it('a past date that is not covered is overdue; the rest stay upcoming', () => {
    expect(views(run(0))).toEqual({ a: 'OVERDUE', b: 'UPCOMING', c: 'MOVED', d: 'UPCOMING' });
    // b is due 6 pm today, so it is only upcoming at 3 pm
    const late = deriveInstallments({ amount: 200_000, writtenOff: 0, paid: 0, installments: rows, now: new Date(2026, 9, 20, 19) });
    expect(views(late).b).toBe('OVERDUE');
  });

  it('a partly covered date that is still in the future is partial', () => {
    const r = run(75_000);
    expect(views(r)).toMatchObject({ a: 'PAID', b: 'PARTIAL' });
    expect(r.find(x => x.id === 'b')!.covered).toBe(25_000);
  });

  it('a partly covered date that is already late stays overdue', () => {
    const r = deriveInstallments({ amount: 200_000, writtenOff: 0, paid: 75_000, installments: rows, now: new Date(2026, 9, 21) });
    expect(views(r).b).toBe('OVERDUE');
    expect(r.find(x => x.id === 'b')!.covered).toBe(25_000);
  });

  it('moved and skipped dates take no money and keep their label', () => {
    const r = run(200_000, [...rows, row('e', at(10, 9), 10, 'SKIPPED')]);
    expect(views(r)).toMatchObject({ c: 'MOVED', e: 'SKIPPED' });
    expect(views(r).a).toBe('PAID');
    expect(views(r).d).toBe('PAID');
  });

  it('undoing a payment recalculates (no stored state)', () => {
    expect(views(run(100_000)).b).toBe('PAID');
    expect(views(run(50_000)).b).toBe('UPCOMING');
  });

  it('a date without an amount asks for the part not planned elsewhere', () => {
    const list = [row('x', at(10, 1), 60_000), row('y', at(10, 8), null)];
    const r = deriveInstallments({ amount: 100_000, writtenOff: 0, paid: 60_000, installments: list, now: NOW });
    expect(r.find(x => x.id === 'y')!.planned).toBe(40_000);
    expect(views(r)).toEqual({ x: 'PAID', y: 'UPCOMING' });
  });

  it('a first date without an amount shrinks when a later date has one (dates never add up to more than owed)', () => {
    const list = [row('x', at(10, 1), null), row('y', at(10, 8), 100_000)];
    const r = deriveInstallments({ amount: 200_000, writtenOff: 0, paid: 0, installments: list, now: NOW });
    expect(r.find(x => x.id === 'x')!.planned).toBe(100_000);
    expect(r.reduce((s, x) => s + x.planned, 0)).toBe(200_000);
  });

  it('a second date without an amount is a reminder only and is paid once the debt is', () => {
    const list = [row('x', at(10, 1), null), row('y', at(10, 8), null)];
    const open = deriveInstallments({ amount: 100, writtenOff: 0, paid: 100, installments: list, now: NOW });
    expect(views(open)).toEqual({ x: 'PAID', y: 'PAID' });
    const unpaid = deriveInstallments({ amount: 100, writtenOff: 0, paid: 0, installments: list, now: NOW });
    expect(unpaid.find(x => x.id === 'y')!.planned).toBe(0);
    expect(views(unpaid).y).toBe('UPCOMING');
  });

  it('a single date with no amount covers the whole remaining debt and is paid when settled', () => {
    const list = [row('x', at(9, 1), null)];
    expect(views(deriveInstallments({ amount: 10_000, writtenOff: 0, paid: 4_000, installments: list, now: NOW })).x).toBe('OVERDUE');
    expect(views(deriveInstallments({ amount: 10_000, writtenOff: 0, paid: 10_000, installments: list, now: NOW })).x).toBe('PAID');
  });

  it('forgiving the rest shrinks what a date without an amount asks for', () => {
    const list = [row('x', at(10, 1), null)];
    const r = deriveInstallments({ amount: 10_000, writtenOff: 6_000, paid: 4_000, installments: list, now: NOW });
    expect(r[0].planned).toBe(4_000);
    expect(r[0].view).toBe('PAID');
  });

  it('ties on the same time are ordered by id so the result is stable', () => {
    const t = at(10, 3);
    const a = deriveInstallments({ amount: 100, writtenOff: 0, paid: 50, installments: [row('b', t, 50), row('a', t, 50)], now: NOW });
    expect(views(a)).toEqual({ a: 'PAID', b: 'UPCOMING' });
  });

  it('rounds money so cents never leave a phantom balance', () => {
    const list = [row('a', at(10, 1), 0.1), row('b', at(10, 2), 0.2)];
    const r = deriveInstallments({ amount: 0.3, writtenOff: 0, paid: 0.3, installments: list, now: NOW });
    expect(views(r)).toEqual({ a: 'PAID', b: 'PAID' });
  });

  describe('helpers', () => {
    it('nextUnpaid is the earliest date that is not paid', () => {
      const d = run(50_000);
      expect(nextUnpaid(rows, d)?.id).toBe('b');
      expect(nextUnpaid(rows, run(200_000))).toBeNull();
    });
    it('finalDeadline is the latest active date, ignoring history', () => {
      expect(finalDeadline(rows)?.getTime()).toBe(at(10, 2, 9).getTime());
      expect(finalDeadline([row('c', at(9, 25), 1, 'MOVED')])).toBeNull();
    });
    it('isOverdue reflects any late uncovered date', () => {
      expect(isOverdue(run(0))).toBe(true);
      expect(isOverdue(run(50_000))).toBe(false);
    });
  });
});
