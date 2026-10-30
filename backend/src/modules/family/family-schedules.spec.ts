import { makeWorld } from './family.fake';
import { ScheduledService } from '../scheduled/scheduled.service';

const HOUR = 3_600_000;

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER'], ['kevin', 'ADMIN']]);
  const synced: string[] = [];
  const reminders = { onTick: () => {}, syncScheduleSafe: async (id: string) => { synced.push(id); } };
  const svc = new ScheduledService(w.db as any, w.transactions, { notify: (...a: unknown[]) => { w.notified.push(a); } } as any, reminders as any, w.scopes);
  const owner = await w.scopeOf('aline', fam.id);
  const kevin = await w.scopeOf('kevin', fam.id);
  const eric = await w.scopeOf('eric', fam.id);
  const grace = await w.scopeOf('grace', fam.id);
  const personal = await w.scopeOf('aline');
  const home = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 100000, currency: 'RWF' } as any);
  const mine = await w.wallets.create(personal, { name: 'Mine', bank: 'BK', balance: 50000, currency: 'RWF' } as any);
  const startAt = new Date(Date.now() + 2 * HOUR);
  const dto = (extra: Record<string, unknown> = {}) => ({ type: 'EXPENSE', category: 'bills', title: 'Rent', amount: 30000, walletId: home.id, startAt: startAt.toISOString(), mode: 'AUTO_POST', ...extra }) as any;
  const bal = (id: string) => Number(w.db.tables.wallet.find(x => x.id === id)!.balance);
  return { w, fam, svc, owner, kevin, eric, grace, personal, home, mine, startAt, dto, bal, synced };
}

describe('Family schedules', () => {
  test('owners and admins create one; members and viewers cannot, but everyone in the family can read them', async () => {
    const { svc, owner, kevin, eric, grace, dto, fam, w } = await setup();
    const made: any = await svc.create(owner, dto());
    expect(w.db.tables.scheduledTransaction[0]).toMatchObject({ clientId: 'aline', familyId: fam.id });
    await svc.create(kevin, dto({ title: 'Wifi' }));
    await expect(svc.create(eric, dto())).rejects.toMatchObject({ response: { code: 'FORBIDDEN_ACTION' } });
    await expect(svc.create(grace, dto())).rejects.toMatchObject({ response: { code: 'FORBIDDEN_ACTION' } });
    expect((await svc.list(grace)).map((s: any) => s.title).sort()).toEqual(['Rent', 'Wifi']);
    expect((await svc.findOne(eric, made.id) as any).title).toBe('Rent');
    await expect(svc.pause(eric, made.id)).rejects.toThrow();
  });

  test('a family schedule is invisible from Personal, and a personal one from the family', async () => {
    const { svc, owner, personal, dto, mine } = await setup();
    const fam: any = await svc.create(owner, dto());
    const own: any = await svc.create(personal, dto({ title: 'My gym', walletId: mine.id }));
    expect((await svc.list(personal)).map((s: any) => s.title)).toEqual(['My gym']);
    expect((await svc.list(owner)).map((s: any) => s.title)).toEqual(['Rent']);
    await expect(svc.findOne(personal, fam.id)).rejects.toThrow();
    await expect(svc.findOne(owner, own.id)).rejects.toThrow();
    await expect(svc.end(owner, own.id)).rejects.toThrow();
  });

  test('a family schedule can only use a wallet of that family, and must name one', async () => {
    const { svc, owner, personal, mine, dto } = await setup();
    await expect(svc.create(owner, dto({ walletId: undefined }))).rejects.toThrow();
    await expect(svc.create(owner, dto({ walletId: mine.id }))).rejects.toThrow();
    await expect(svc.create(personal, dto({ walletId: 'nope' }))).rejects.toThrow();
  });

  test('"post automatically" posts a family transaction as its creator, once, and moves the family wallet', async () => {
    const { svc, owner, dto, w, fam, home, bal, startAt } = await setup();
    await svc.create(owner, dto());
    const later = new Date(startAt.getTime() + 60_000);
    expect(await svc.processDue(later)).toMatchObject({ posted: 1, failed: 0 });
    expect(await svc.processDue(later)).toMatchObject({ posted: 0 });
    expect(bal(home.id)).toBe(70000);
    const tx = w.db.tables.transaction.find(t => t.title === 'Rent')!;
    expect([tx.familyId, tx.clientId, Number(tx.amount)]).toEqual([fam.id, 'aline', 30000]);
    expect(w.notified.some(n => n[0] === 'eric')).toBe(true);          // the rest of the family hears about it
  });

  test('if the person who set it up has left, it does not post, says why, and the managers are told', async () => {
    const { svc, kevin, dto, w, fam, home, bal, startAt } = await setup();
    await svc.create(kevin, dto());
    await w.families.removeMember('aline', fam.id, 'kevin');
    w.notified.length = 0;
    const later = new Date(startAt.getTime() + 60_000);
    expect(await svc.processDue(later)).toMatchObject({ posted: 0, failed: 1 });
    expect(bal(home.id)).toBe(100000);
    expect(w.db.tables.scheduledOccurrence[0]).toMatchObject({ status: 'FAILED' });
    expect(String(w.db.tables.scheduledOccurrence[0].failReason)).toContain('no longer in the family');
    expect(w.notified.some(n => n[0] === 'aline')).toBe(true);
  });

  test('"remind and confirm" dates are confirmed or skipped by owners and admins only', async () => {
    const { svc, owner, kevin, eric, dto, bal, home, startAt } = await setup();
    await svc.create(owner, dto({ mode: 'REMIND_CONFIRM' }));
    const later = new Date(startAt.getTime() + 60_000);
    await svc.processDue(later);
    expect(await svc.waiting(eric, later)).toHaveLength(1);            // everyone in the family can see what is due
    const mine: any[] = await svc.waiting(kevin, later);
    expect(mine).toHaveLength(1);
    await expect(svc.confirm(eric, mine[0].id, {}, later)).rejects.toThrow();
    await svc.confirm(kevin, mine[0].id, {}, later);
    expect(bal(home.id)).toBe(70000);
    await expect(svc.skip(kevin, mine[0].id, later)).rejects.toThrow();   // already handled
  });
});
