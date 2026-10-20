import { FEED_VIEWS, parseView, viewFilter } from './feed-view';

describe('feed views', () => {
  it('knows the six chips', () => {
    expect([...FEED_VIEWS]).toEqual(['all', 'income', 'expense', 'debt', 'credit', 'scheduled']);
  });

  it('anything unknown means "all"', () => {
    expect(parseView(undefined)).toBe('all');
    expect(parseView('')).toBe('all');
    expect(parseView('nonsense')).toBe('all');
    expect(parseView('{"$ne":1}')).toBe('all');
    expect(parseView('debt')).toBe('debt');
    expect(parseView('scheduled')).toBe('scheduled');
  });

  it('"all" hides debt rows only when loans are switched off', () => {
    expect(viewFilter('all', true)).toEqual({});
    expect(viewFilter('all', false)).toEqual({ debtRole: null });
  });

  it('income never includes borrowed money, and leaves out every loan row when loans are off', () => {
    expect(viewFilter('income', true)).toEqual({ type: 'INCOME', OR: [{ debtRole: null }, { debtRole: { not: 'BORROW_IN' } }] });
    expect(viewFilter('income', false)).toEqual({ type: 'INCOME', debtRole: null });
  });

  it('expense keeps lending and repayments when loans are on, drops them when off', () => {
    expect(viewFilter('expense', true)).toEqual({ type: 'EXPENSE' });
    expect(viewFilter('expense', false)).toEqual({ type: 'EXPENSE', debtRole: null });
  });

  it('debt = borrowed + repayments I made; credit = lent + repayments I received; whatever the switch says', () => {
    for (const loans of [true, false]) {
      expect(viewFilter('debt', loans)).toEqual({ debtRole: { in: ['BORROW_IN', 'REPAY_OUT'] } });
      expect(viewFilter('credit', loans)).toEqual({ debtRole: { in: ['LEND_OUT', 'REPAY_IN'] } });
    }
  });

  it('scheduled = rows a schedule posted', () => {
    expect(viewFilter('scheduled')).toEqual({ scheduledOccurrenceId: { not: null } });
  });
});
