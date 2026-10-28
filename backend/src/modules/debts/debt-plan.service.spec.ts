import { BadRequestException } from '@nestjs/common';
import { blankRule, RepeatRule } from '../scheduled/recurrence';
import { DebtPlanService } from './debt-plan.service';
import { DebtsService } from './debts.service';

const monthlyOn5: RepeatRule = { ...blankRule('MONTH'), monthDays: [5] };
const at = (y: number, m: number, d: number, h = 9) => new Date(Date.UTC(y, m - 1, d, h, 0));
const NOW = at(2030, 10, 20);

/** A tiny in-memory stand-in for the database: one loan and its pay dates. */
function fakeDb(loan: any, installments: any[]) {
  const db = { loan: { ...loan }, rows: installments.map(r => ({ ...r })), nextId: 100 };
  const prx: any = {
    debtInstallment: {
      deleteMany: async ({ where }: any) => { db.rows = db.rows.filter(r => !where.id.in.includes(r.id)); },
      update: async ({ where, data }: any) => { Object.assign(db.rows.find(r => r.id === where.id), data); },
      createMany: async ({ data }: any) => { for (const d of data) db.rows.push({ id: `n${db.nextId++}`, status: 'PENDING', note: null, ...d }); },
      findMany: async () => db.rows.map(r => ({ ...r })),
    },
    debt: { update: async ({ data }: any) => { Object.assign(db.loan, data); } },
  };
  const prisma: any = {
    debt: {
      findUnique: async () => ({ ...db.loan, installments: db.rows.map(r => ({ ...r })) }),
      findMany: async () => [{ id: db.loan.id }],
    },
    $transaction: async (cb: any) => cb(prx),
  };
  return { db, service: new DebtPlanService(prisma) };
}

const loan = (o: any = {}) => ({
  id: 'd1', kind: 'BORROWED', status: 'OPEN', archivedAt: null, amount: 400_000, paid: 0, writtenOffAmount: 0,
  planAmount: 100_000, planRepeat: monthlyOn5, planStartAt: at(2030, 11, 5), planTimezone: 'UTC', dueDate: at(2030, 11, 5), ...o,
});
const first = { id: 'a', debtId: 'd1', dueAt: at(2030, 11, 5), plannedAmount: 100_000, status: 'PENDING', fromPlan: false };
const day = (d: Date) => d.toISOString().slice(0, 10);

describe('DebtPlanService', () => {
  it('adds the pay dates a plan needs, and the loan\'s final deadline follows the last one', async () => {
    const { db, service } = fakeDb(loan(), [first]);
    await service.reconcile('d1', NOW);
    expect(db.rows.filter(r => r.fromPlan).map(r => day(r.dueAt))).toEqual(['2030-12-05', '2031-01-05', '2031-02-05']);
    expect(db.rows.filter(r => r.fromPlan).every(r => r.plannedAmount === 100_000)).toBe(true);
    expect(day(db.loan.dueDate)).toBe('2031-02-05');
  });

  it('does nothing the second time', async () => {
    const { db, service } = fakeDb(loan(), [first]);
    await service.reconcile('d1', NOW);
    const before = JSON.stringify(db.rows);
    const result = await service.reconcile('d1', NOW);
    expect(JSON.stringify(db.rows)).toBe(before);
    expect(result!.create).toHaveLength(0);
  });

  it('after a bigger payment the dates ahead shrink, and the extra ones go', async () => {
    const { db, service } = fakeDb(loan(), [first]);
    await service.reconcile('d1', NOW);
    db.loan.paid = 250_000;
    await service.reconcile('d1', NOW);
    const ahead = db.rows.filter(r => r.fromPlan);
    expect(ahead.map(r => [day(r.dueAt), r.plannedAmount])).toEqual([['2030-12-05', 100_000], ['2031-01-05', 50_000]]);
  });

  it('a loan with no plan and no plan dates is left alone (no work at all)', async () => {
    const { db, service } = fakeDb(loan({ planAmount: null, planRepeat: null, planStartAt: null }), [first]);
    expect(await service.reconcile('d1', NOW)).toBeNull();
    expect(db.rows).toHaveLength(1);
  });

  it('stopping the plan removes the dates it made but never the person\'s own', async () => {
    const { db, service } = fakeDb(loan(), [first]);
    await service.reconcile('d1', NOW);
    Object.assign(db.loan, { planAmount: null, planRepeat: null, planStartAt: null });
    await service.reconcile('d1', NOW);
    expect(db.rows.map(r => r.id)).toEqual(['a']);
  });

  it('a settled loan loses its dates ahead', async () => {
    const { db, service } = fakeDb(loan(), [first]);
    await service.reconcile('d1', NOW);
    db.loan.status = 'SETTLED';
    await service.reconcile('d1', NOW);
    expect(db.rows.filter(r => r.fromPlan)).toHaveLength(0);
  });

  it('a debt owed to me never gets plan dates, even if a plan was somehow saved', async () => {
    const { db, service } = fakeDb(loan({ kind: 'LENT' }), [first]);
    await service.reconcile('d1', NOW);
    expect(db.rows).toHaveLength(1);
  });

  it('the hourly pass carries on when one loan fails', async () => {
    const { service } = fakeDb(loan(), [first]);
    jest.spyOn(service, 'reconcile').mockRejectedValueOnce(new Error('boom'));
    await expect(service.reconcileAll(NOW)).resolves.toBe(0);
  });
});

describe('creating and editing a loan with an estimated payment', () => {
  const clientId = 'c1';
  function setup(existing?: any) {
    const created: any = { debt: null, rows: [] as any[], updates: [] as any[] };
    const prx: any = {
      debt: {
        create: async ({ data }: any) => { created.debt = data; return { id: 'd1', ...data }; },
        update: async ({ data }: any) => { created.updates.push(data); },
      },
      debtInstallment: {
        create: async ({ data }: any) => { created.rows.push(data); return data; },
        count: async () => 0,
        findMany: async () => [],
        update: async ({ data }: any) => { created.rows.push({ updated: data }); },
      },
    };
    const prisma: any = {
      $transaction: async (cb: any) => cb(prx),
      notificationPreference: { findUnique: async () => ({ timezone: 'Africa/Kigali' }) },
      debt: { findFirst: async () => existing ?? null },
    };
    const svc: any = new DebtsService(prisma, { notify: () => {} } as any, { syncDebtSafe: async () => {} } as any, { reconcile: async () => null } as any);
    svc.move = async () => 'tx1';
    svc.finish = async () => ({ ok: true });
    svc.syncDeadline = async () => {};
    return { svc, created };
  }
  const dto = (o: any = {}) => ({ kind: 'BORROWED', person: 'Bank', amount: 400_000, currency: 'RWF', dueDate: '2030-11-05T09:00:00.000Z', planAmount: 100_000, planRepeat: monthlyOn5, ...o });

  it('saves the plan, with the first pay date asking for the estimated payment', async () => {
    const { svc, created } = setup();
    await svc.create(clientId, dto());
    expect(created.debt).toMatchObject({ planAmount: 100_000, planTimezone: 'Africa/Kigali' });
    expect(created.debt.planStartAt.toISOString()).toBe('2030-11-05T09:00:00.000Z');
    expect(created.rows[0]).toMatchObject({ plannedAmount: 100_000 });
  });

  it('an estimate above a small loan is refused and nothing is saved', async () => {
    const { svc, created } = setup();
    await svc.create(clientId, dto({ amount: 60_000, planAmount: 100_000 })).catch(() => undefined);
    expect(created.debt).toBeNull();
  });

  it('refuses an estimate above the loan, one without a repeat, and a plan with no first date', async () => {
    const { svc } = setup();
    await expect(svc.create(clientId, dto({ planAmount: 500_000 }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create(clientId, dto({ planRepeat: undefined }))).rejects.toThrow(/how often/);
    await expect(svc.create(clientId, dto({ dueDate: undefined }))).rejects.toThrow(/first pay date/);
  });

  it('a debt owed to me ignores an estimated payment', async () => {
    const { svc, created } = setup();
    await svc.create(clientId, dto({ kind: 'LENT' }));
    expect(created.debt.planAmount).toBeUndefined();
  });

  it('the time zone sent by the phone wins over the saved one, and a wrong one is ignored', async () => {
    const a = setup(); await a.svc.create(clientId, dto({ planTimezone: 'Europe/Paris' }));
    expect(a.created.debt.planTimezone).toBe('Europe/Paris');
    const b = setup(); await b.svc.create(clientId, dto({ planTimezone: 'Not/AZone' }));
    expect(b.created.debt.planTimezone).toBe('Africa/Kigali');
  });

  const existing = (o: any = {}) => ({
    id: 'd1', clientId, kind: 'BORROWED', person: 'Bank', amount: 400_000, paid: 0, writtenOffAmount: 0, status: 'OPEN', archivedAt: null,
    planAmount: null, planRepeat: null, planStartAt: null, planTimezone: null, dueDate: at(2030, 11, 5), principalTransactionId: null,
    installments: [{ id: 'a', dueAt: at(2030, 11, 5), plannedAmount: null, status: 'PENDING', fromPlan: false }], payments: [], reminders: [], ...o,
  });

  it('adds a plan to an existing loan, starting at its next pay date, and says how much that date asks', async () => {
    const { svc, created } = setup(existing());
    await svc.update(clientId, 'd1', { planAmount: 100_000, planRepeat: monthlyOn5 });
    const saved = created.updates.at(-1);
    expect(saved).toMatchObject({ planAmount: 100_000 });
    expect(saved.planStartAt.toISOString()).toBe('2030-11-05T09:00:00.000Z');
    expect(created.rows).toContainEqual({ updated: { plannedAmount: 100_000 } });
  });

  it('stops a plan with null', async () => {
    const { svc, created } = setup(existing({ planAmount: 100_000, planRepeat: monthlyOn5, planStartAt: at(2030, 11, 5), planTimezone: 'UTC' }));
    await svc.update(clientId, 'd1', { planAmount: null });
    expect(created.updates.at(-1)).toMatchObject({ planAmount: null, planStartAt: null, planTimezone: null });
  });

  it('only a loan can have one', async () => {
    const { svc } = setup(existing({ kind: 'LENT' }));
    await expect(svc.update(clientId, 'd1', { planAmount: 1000, planRepeat: monthlyOn5 })).rejects.toThrow(/only for a loan/);
  });

  it('a closed loan cannot start a new plan', async () => {
    const { svc } = setup(existing({ status: 'SETTLED' }));
    await expect(svc.update(clientId, 'd1', { planAmount: 1000, planRepeat: monthlyOn5 })).rejects.toThrow(/closed/);
  });
});
