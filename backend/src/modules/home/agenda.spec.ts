import { AgendaItem, homeSchedule, sortAgenda } from './agenda';

const item = (key: string, dueAt: Date, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  key, source: 'SCHEDULED', refId: key, occurrenceId: null, title: key, person: null, dueAt, overdue: false, waiting: false, failed: false, failReason: null, amount: 1, currency: 'RWF', direction: 'OUT', ...extra,
});
const d = (n: number) => new Date(2026, 9, n);

describe('sortAgenda', () => {
  it('puts overdue first (oldest first), then by date', () => {
    const out = sortAgenda([item('c', d(9)), item('b', d(3), { overdue: true }), item('a', d(1), { overdue: true }), item('d', d(5))]);
    expect(out.map(i => i.key)).toEqual(['a', 'b', 'd', 'c']);
  });
  it('does not change the list it is given', () => {
    const list = [item('b', d(9)), item('a', d(1))];
    sortAgenda(list);
    expect(list.map(i => i.key)).toEqual(['b', 'a']);
  });
});

describe('homeSchedule', () => {
  const last = { title: 'Rent', at: d(1), status: 'POSTED' as const };
  it('shows the next two and counts the rest; the last one is hidden while something is ahead', () => {
    const r = homeSchedule([item('a', d(5)), item('b', d(6)), item('c', d(7))], last, 3);
    expect(r.upcoming.map(i => i.key)).toEqual(['a', 'b']);
    expect(r.more).toBe(1);
    expect(r.last).toBeNull();
  });
  it('with nothing ahead, the latest one is shown', () => {
    const r = homeSchedule([], last, 2);
    expect(r).toEqual({ upcoming: [], more: 0, last, scheduleCount: 2 });
  });
  it('an overdue loan date comes before a later schedule', () => {
    const r = homeSchedule([item('rent', d(9)), item('loan', d(2), { source: 'DEBT', overdue: true })], null, 1);
    expect(r.upcoming[0].key).toBe('loan');
  });
});
