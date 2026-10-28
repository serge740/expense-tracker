import { blankRule, RepeatRule } from '../scheduled/recurrence';
import { PLAN_AHEAD, PlanInput, PlanRow, planChanges, planProblem } from './debt-plan';

const at = (y: number, m: number, d: number, h = 9) => new Date(Date.UTC(y, m - 1, d, h, 0));
const monthlyOn5: RepeatRule = { ...blankRule('MONTH'), monthDays: [5] };
const NOW = at(2030, 10, 20);                       // 20 Oct 2030, 09:00 UTC
const START = at(2030, 11, 5);                      // the first pay date: 5 Nov 2030

let n = 0;
const row = (o: Partial<PlanRow> & { dueAt: Date }): PlanRow => ({ id: `r${++n}`, plannedAmount: null, status: 'PENDING', fromPlan: false, ...o });
const base = (o: Partial<PlanInput> = {}): PlanInput => ({
  amount: 400_000, paid: 0, writtenOff: 0, live: true, now: NOW,
  plan: { amount: 100_000, rule: monthlyOn5, startAt: START, timezone: 'UTC' },
  installments: [row({ dueAt: START, plannedAmount: 100_000 })],
  ...o,
});
const dates = (list: { dueAt: Date }[]) => list.map(x => x.dueAt.toISOString().slice(0, 10));

/** Pretend the changes were saved, so the next run sees them. */
function apply(input: PlanInput, r: ReturnType<typeof planChanges>): PlanInput {
  const kept = input.installments.filter(x => !r.remove.includes(x.id)).map(x => {
    const u = r.update.find(y => y.id === x.id);
    return u ? { ...x, plannedAmount: u.plannedAmount } : x;
  });
  const made = r.create.map(c => row({ dueAt: c.dueAt, plannedAmount: c.plannedAmount, fromPlan: true }));
  return { ...input, installments: [...kept, ...made] };
}

describe('planning the dates of a loan', () => {
  it('keeps going until the loan is finished: 400,000 at 100,000 a month is four payments', () => {
    const r = planChanges(base());
    expect(dates(r.create)).toEqual(['2030-12-05', '2031-01-05', '2031-02-05']);   // the first (5 Nov) is the person's own
    expect(r.create.map(c => c.plannedAmount)).toEqual([100_000, 100_000, 100_000]);
    expect(r.finishesAt?.toISOString().slice(0, 10)).toBe('2031-02-05');
    expect(r.paymentsLeft).toBe(4);
    expect(r.shortfall).toBe(0);
  });

  it('the last payment asks only for what is left', () => {
    const r = planChanges(base({ amount: 350_000 }));
    expect(r.create.map(c => c.plannedAmount)).toEqual([100_000, 100_000, 50_000]);
    expect(dates(r.create)[2]).toBe('2031-02-05');
  });

  it('a payment of exactly the estimate each time leaves nothing over', () => {
    const r = planChanges(base({ amount: 100_000 }));
    expect(r.create).toEqual([]);
    expect(r.paymentsLeft).toBe(1);
    expect(r.finishesAt?.toISOString().slice(0, 10)).toBe('2030-11-05');
  });

  it('running it again after saving changes nothing', () => {
    const first = planChanges(base());
    const again = planChanges(apply(base(), first));
    expect(again.create).toEqual([]);
    expect(again.update).toEqual([]);
    expect(again.remove).toEqual([]);
  });

  it('an extra payment shortens the plan: the last dates shrink or disappear', () => {
    const start = apply(base(), planChanges(base()));          // 5 Nov (own) + Dec, Jan, Feb
    const paid = { ...start, paid: 250_000 };                   // 250,000 paid: 150,000 left
    const r = planChanges(paid);
    expect(r.create).toEqual([]);
    expect(r.update.map(u => u.plannedAmount)).toEqual([50_000]);   // January now asks 50,000
    expect(r.remove).toHaveLength(1);                                // February is not needed any more
    expect(r.finishesAt?.toISOString().slice(0, 10)).toBe('2031-01-05');
  });

  it('a missed date stays owed on its own date and is not piled onto later ones', () => {
    const start = apply(base(), planChanges(base()));
    // It is now 20 Dec: November was paid, December (a plan date) passed unpaid.
    const later = { ...start, now: at(2030, 12, 20), paid: 100_000 };
    const r = planChanges(later);
    expect(r.create).toEqual([]);
    expect(r.update).toEqual([]);
    expect(r.remove).toEqual([]);                                     // Jan and Feb stay exactly as they were
    expect(r.finishesAt?.toISOString().slice(0, 10)).toBe('2031-02-05');
    expect(r.paymentsLeft).toBe(3);                                   // late December, January, February
  });

  it('a skipped date pushes the end back by one', () => {
    const start = apply(base(), planChanges(base()));
    const dec = start.installments.find(x => dates([x])[0] === '2030-12-05')!;
    const skipped = { ...start, installments: start.installments.map(x => (x.id === dec.id ? { ...x, status: 'SKIPPED' as const } : x)), paid: 100_000 };
    const r = planChanges(skipped);
    expect(dates(r.create)).toEqual(['2031-03-05']);                  // December is taken, so March is added
    expect(r.finishesAt?.toISOString().slice(0, 10)).toBe('2031-03-05');
  });

  it('a date moved by hand is not made again at its old day', () => {
    const start = apply(base(), planChanges(base()));
    const dec = start.installments.find(x => dates([x])[0] === '2030-12-05')!;
    const moved = {
      ...start, paid: 100_000,
      installments: [
        ...start.installments.map(x => (x.id === dec.id ? { ...x, status: 'MOVED' as const } : x)),
        row({ dueAt: at(2030, 12, 12), plannedAmount: 100_000 }),
      ],
    };
    const r = planChanges(moved);
    expect(r.create).toEqual([]);
    expect(r.remove).toEqual([]);
    expect(r.finishesAt?.toISOString().slice(0, 10)).toBe('2031-02-05');
  });

  it('a date the person added on a day the plan would use counts once', () => {
    const own = base({ installments: [row({ dueAt: START, plannedAmount: 100_000 }), row({ dueAt: at(2030, 12, 5), plannedAmount: 100_000 })] });
    const r = planChanges(own);
    expect(dates(r.create)).toEqual(['2031-01-05', '2031-02-05']);
  });

  it('a date that asks for "the rest" leaves nothing for the plan to add', () => {
    const r = planChanges(base({ installments: [row({ dueAt: START, plannedAmount: null })] }));
    expect(r.create).toEqual([]);
    expect(r.paymentsLeft).toBe(1);
  });

  it('a settled or archived loan has no plan dates ahead', () => {
    const start = apply(base(), planChanges(base()));
    const r = planChanges({ ...start, live: false });
    expect(r.remove).toHaveLength(3);
    expect(r.create).toEqual([]);
    expect(r.finishesAt).toBeNull();
  });

  it('stopping the plan removes the dates it made, and keeps the person\'s own', () => {
    const start = apply(base(), planChanges(base()));
    const r = planChanges({ ...start, plan: null });
    expect(r.remove).toHaveLength(3);
    expect(start.installments.filter(x => !x.fromPlan)).toHaveLength(1);
  });

  it('dates already past are history: the plan never removes or rewrites them', () => {
    const start = apply(base(), planChanges(base()));
    const r = planChanges({ ...start, now: at(2031, 1, 20), paid: 100_000 });
    expect(r.remove.every(id => start.installments.find(x => x.id === id && x.dueAt.getTime() > at(2031, 1, 20).getTime()))).toBe(true);
  });

  it('a rule that ends before the loan does says how much it leaves', () => {
    const short: RepeatRule = { ...monthlyOn5, ends: { type: 'after', count: 2 } };
    const r = planChanges(base({ plan: { amount: 100_000, rule: short, startAt: START, timezone: 'UTC' } }));
    expect(dates(r.create)).toEqual(['2030-12-05']);                   // 5 Nov (own) + 5 Dec is two
    expect(r.shortfall).toBe(200_000);
    expect(r.finishesAt).toBeNull();
  });

  it('a very long loan keeps only the next dates ready, and still knows the end', () => {
    const weekly: RepeatRule = { ...blankRule('WEEK'), weekdays: [2] };
    const r = planChanges(base({ amount: 100_000, installments: [row({ dueAt: START, plannedAmount: 1_000 })], plan: { amount: 1_000, rule: weekly, startAt: START, timezone: 'UTC' } }));
    expect(r.create).toHaveLength(PLAN_AHEAD);
    expect(r.paymentsLeft).toBe(100);
    expect(r.finishesAt).not.toBeNull();
    expect(r.finishesAt!.getTime()).toBeGreaterThan(at(2032, 6, 1).getTime());
  });

  it('times follow the person\'s own clock, not UTC', () => {
    const evening = (d: Date) => new Date(d.getTime() + 9 * 3_600_000);   // 18:00 in Kigali is 16:00 UTC; start 5 Nov 18:00 Kigali = 16:00 UTC
    const start = new Date(Date.UTC(2030, 10, 5, 16, 0));
    const r = planChanges(base({ plan: { amount: 100_000, rule: monthlyOn5, startAt: start, timezone: 'Africa/Kigali' }, installments: [row({ dueAt: start, plannedAmount: 100_000 })] }));
    expect(r.create.every(c => c.dueAt.getUTCHours() === 16)).toBe(true);
    void evening;
  });
});

describe('what makes a plan unusable', () => {
  it('needs a positive amount, not more than the loan, and a valid repeat', () => {
    expect(planProblem({ amount: 0, rule: monthlyOn5, loanAmount: 400_000 })).toMatch(/greater than zero/);
    expect(planProblem({ amount: 500_000, rule: monthlyOn5, loanAmount: 400_000 })).toMatch(/more than the loan/);
    expect(planProblem({ amount: 50_000, rule: null, loanAmount: 400_000 })).toMatch(/how often/);
    expect(planProblem({ amount: 50_000, rule: { ...monthlyOn5, every: 0 }, loanAmount: 400_000 })).toBeTruthy();
    expect(planProblem({ amount: 50_000, rule: monthlyOn5, loanAmount: 400_000 })).toBeNull();
  });
});
