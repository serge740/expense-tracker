import { makeWorld } from './family.fake';
import { DebtsService } from '../debts/debts.service';
import { ScheduledService } from '../scheduled/scheduled.service';
import { RemindersService } from '../reminders/reminders.service';

const DAY = 86_400_000;

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER'], ['kevin', 'ADMIN']]);
  const reminders = new RemindersService(w.db as any, { sendToClient: async () => [] } as any, { sendEmail: async () => {} } as any);
  const debts = new DebtsService(w.db as any, { notify: (...a: unknown[]) => { w.notified.push(a); } } as any, reminders, { reconcile: async () => {} } as any);
  const sched = new ScheduledService(w.db as any, w.transactions, { notify: () => {} } as any, reminders, w.scopes);
  const owner = await w.scopeOf('aline', fam.id);
  const kevin = await w.scopeOf('kevin', fam.id);
  const personal = await w.scopeOf('aline');
  const home = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 100000, currency: 'RWF' } as any);
  const rows = (filter: (r: any) => boolean = () => true) => w.db.tables.reminder.filter(filter);
  const who = () => rows(r => r.status === 'ACTIVE').map(r => r.clientId).sort();
  return { w, fam, reminders, debts, sched, owner, kevin, personal, home, rows, who };
}

describe('Family reminders', () => {
  test('a family pay date reminds every owner and admin, each with a reminder of their own, and nobody else', async () => {
    const { debts, owner, who, rows } = await setup();
    await debts.create(owner, { kind: 'BORROWED', person: 'Bank', amount: 50000, currency: 'RWF', dueDate: new Date(Date.now() + 3 * DAY).toISOString() } as any);
    expect(who()).toEqual(['aline', 'kevin']);                         // the owner and the admin: not the member, not the viewer
    expect(new Set(rows().map(r => r.installmentId)).size).toBe(1);   // one pay date, two reminders
  });

  test('a personal pay date still reminds only its owner', async () => {
    const { debts, personal, who } = await setup();
    await debts.create(personal, { kind: 'BORROWED', person: 'Mum', amount: 1000, currency: 'RWF', dueDate: new Date(Date.now() + 3 * DAY).toISOString() } as any);
    expect(who()).toEqual(['aline']);
  });

  test('paying it off completes every reminder; an admin who is demoted stops being reminded on the next change', async () => {
    const { debts, owner, kevin, w, who, rows } = await setup();
    const d: any = await debts.create(owner, { kind: 'BORROWED', person: 'Bank', amount: 1000, currency: 'RWF', dueDate: new Date(Date.now() + 3 * DAY).toISOString() } as any);
    w.db.tables.familyMember.find(m => m.clientId === 'kevin')!.role = 'MEMBER';
    await debts.update(owner, d.id, { note: 'touch' } as any);
    expect(who()).toEqual(['aline']);
    expect(rows(r => r.clientId === 'kevin')[0].status).toBe('CANCELLED');
    w.db.tables.familyMember.find(m => m.clientId === 'kevin')!.role = 'ADMIN';
    await debts.update(owner, d.id, { note: 'touch again' } as any);
    expect(who()).toEqual(['aline', 'kevin']);
    await debts.addPayment(kevin, d.id, { amount: 1000 } as any);
    expect(rows().map(r => r.status)).toEqual(['DONE', 'DONE']);
  });

  test('a family schedule that asks to confirm reminds every owner and admin for the same date', async () => {
    const { sched, owner, who, rows, home } = await setup();
    await sched.create(owner, { type: 'EXPENSE', category: 'bills', title: 'Rent', amount: 30000, walletId: home.id, startAt: new Date(Date.now() + 2 * DAY).toISOString(), mode: 'REMIND_CONFIRM' } as any);
    expect(who()).toEqual(['aline', 'kevin']);
    expect(new Set(rows().map(r => r.occurrenceId)).size).toBe(1);
  });

  test('a reminder for someone who left the family is closed when it comes due instead of being sent', async () => {
    const { sched, owner, w, reminders, rows, home } = await setup();
    await sched.create(owner, { type: 'EXPENSE', category: 'bills', title: 'Rent', amount: 30000, walletId: home.id, startAt: new Date(Date.now() + 2 * DAY).toISOString(), mode: 'REMIND_CONFIRM' } as any);
    await w.families.removeMember('aline', (w.db.tables.family[0] as any).id, 'kevin');
    const kevin = rows(r => r.clientId === 'kevin')[0];
    kevin.nextFireAt = new Date(Date.now() - 1000);
    await reminders.tick(new Date());
    expect(rows(r => r.clientId === 'kevin')[0].status).toBe('CANCELLED');
    expect(await reminders.pending('kevin')).toEqual([]);
  });
});
