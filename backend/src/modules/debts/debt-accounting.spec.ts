import {
  buildLedger, directionFor, remainingOf, roleFor, rolesOf, round2, statusFor, sumMoney,
} from './debt-accounting';

describe('debt accounting', () => {
  describe('roleFor / directionFor', () => {
    it('borrowing brings money in and is tagged BORROW_IN (never income)', () => {
      expect(directionFor('BORROWED', 'principal')).toBe('in');
      expect(roleFor('BORROWED', 'principal')).toBe('BORROW_IN');
    });
    it('repaying a debt sends money out', () => {
      expect(directionFor('BORROWED', 'payment')).toBe('out');
      expect(roleFor('BORROWED', 'payment')).toBe('REPAY_OUT');
    });
    it('lending sends money out', () => {
      expect(directionFor('LENT', 'principal')).toBe('out');
      expect(roleFor('LENT', 'principal')).toBe('LEND_OUT');
    });
    it('being repaid brings money in', () => {
      expect(directionFor('LENT', 'payment')).toBe('in');
      expect(roleFor('LENT', 'payment')).toBe('REPAY_IN');
    });
    it('each kind owns exactly its two roles', () => {
      expect(rolesOf('BORROWED')).toEqual(['BORROW_IN', 'REPAY_OUT']);
      expect(rolesOf('LENT')).toEqual(['LEND_OUT', 'REPAY_IN']);
    });
  });

  describe('remaining and status', () => {
    it('lent 10,000 and received 2,000 leaves 8,000', () => {
      expect(remainingOf(10000, 2000)).toBe(8000);
    });
    it('never goes negative', () => {
      expect(remainingOf(100, 150)).toBe(0);
    });
    it('subtracts a written-off amount', () => {
      expect(remainingOf(10000, 2000, 8000)).toBe(0);
    });
    it('stays OPEN while a balance remains', () => {
      expect(statusFor({ kind: 'LENT', amount: 10000, paid: 2000, writtenOff: 0, current: 'OPEN' })).toBe('OPEN');
    });
    it('is SETTLED when fully paid', () => {
      expect(statusFor({ kind: 'LENT', amount: 10000, paid: 10000, writtenOff: 0, current: 'OPEN' })).toBe('SETTLED');
    });
    it('a written-off credit becomes WRITTEN_OFF, a forgiven debt FORGIVEN', () => {
      expect(statusFor({ kind: 'LENT', amount: 10000, paid: 2000, writtenOff: 8000, current: 'OPEN' })).toBe('WRITTEN_OFF');
      expect(statusFor({ kind: 'BORROWED', amount: 10000, paid: 2000, writtenOff: 8000, current: 'OPEN' })).toBe('FORGIVEN');
    });
    it('keeps its write-off outcome once closed', () => {
      expect(statusFor({ kind: 'LENT', amount: 10000, paid: 2000, writtenOff: 8000, current: 'WRITTEN_OFF' })).toBe('WRITTEN_OFF');
    });
    it('reopens when removing a payment leaves a balance', () => {
      expect(statusFor({ kind: 'BORROWED', amount: 10000, paid: 9000, writtenOff: 0, current: 'SETTLED' })).toBe('OPEN');
    });
  });

  describe('money math', () => {
    it('sums without floating-point drift', () => {
      expect(sumMoney([0.1, 0.2])).toBe(0.3);
      expect(sumMoney(['10.10', 20.2, '0.05'])).toBe(30.35);
    });
    it('rounds to 2 decimals', () => {
      expect(round2(1.005 * 100)).toBe(100.5);
    });
  });

  describe('buildLedger', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const past = new Date('2026-10-01T00:00:00Z');

    it('totals taken, paid and remaining per currency without converting', () => {
      const rows = buildLedger([
        { amount: 10000, paid: 2000, writtenOff: 0, currency: 'RWF', status: 'OPEN', dueDate: null },
        { amount: 5000, paid: 5000, writtenOff: 0, currency: 'RWF', status: 'SETTLED', dueDate: null },
        { amount: 100, paid: 0, writtenOff: 0, currency: 'USD', status: 'OPEN', dueDate: null },
      ], now);
      const rwf = rows.find(r => r.currency === 'RWF')!;
      expect(rwf).toMatchObject({ taken: 15000, paid: 7000, remaining: 8000, openCount: 1, settledCount: 1, debtCount: 2 });
      expect(rows.find(r => r.currency === 'USD')).toMatchObject({ taken: 100, remaining: 100 });
    });

    it('counts overdue only for open debts past their due date', () => {
      const [row] = buildLedger([
        { amount: 100, paid: 0, writtenOff: 0, currency: 'RWF', status: 'OPEN', dueDate: past },
        { amount: 100, paid: 100, writtenOff: 0, currency: 'RWF', status: 'SETTLED', dueDate: past },
      ], now);
      expect(row.overdueCount).toBe(1);
    });

    it('separates settled from written-off / forgiven', () => {
      const [row] = buildLedger([
        { amount: 100, paid: 100, writtenOff: 0, currency: 'RWF', status: 'SETTLED', dueDate: null },
        { amount: 100, paid: 20, writtenOff: 80, currency: 'RWF', status: 'WRITTEN_OFF', dueDate: null },
        { amount: 100, paid: 0, writtenOff: 100, currency: 'RWF', status: 'FORGIVEN', dueDate: null },
      ], now);
      expect(row).toMatchObject({ settledCount: 1, closedOutCount: 2, remaining: 0, writtenOff: 180 });
    });
  });
});
