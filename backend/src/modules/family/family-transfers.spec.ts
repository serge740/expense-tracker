import { makeWorld } from './family.fake';
import { FamilyTransfersService } from './family-transfers.service';

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER'], ['kevin', 'ADMIN']]);
  const notes: unknown[][] = [];
  const transfers = new FamilyTransfersService(w.db as any, w.access, { notify: (...a: unknown[]) => { notes.push(a); } } as any);
  const owner = await w.scopeOf('aline', fam.id);
  const mine = await w.scopeOf('eric');
  const home = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 100000, currency: 'RWF' } as any);
  const ericWallet = await w.wallets.create(mine, { name: 'Eric MoMo', bank: 'MTN', balance: 50000, currency: 'RWF' } as any);
  const bal = (id: string) => Number(w.db.tables.wallet.find(x => x.id === id)!.balance);
  return { w, fam, transfers, home, ericWallet, bal, notes };
}

describe('Contribution transfers', () => {
  test('a contribution moves money once and leaves one row in each space, tied by one group id', async () => {
    const { w, fam, transfers, home, ericWallet, bal } = await setup();
    const r: any = await transfers.contribute('eric', fam.id, { personalWalletId: ericWallet.id, familyWalletId: home.id, amount: 20000, note: 'rent share' });
    expect([bal(ericWallet.id), bal(home.id)]).toEqual([30000, 120000]);
    const rows = w.db.tables.transaction.filter(t => t.transferGroupId === r.groupId);
    expect(rows).toHaveLength(2);
    const out = rows.find(t => t.type === 'EXPENSE')!;
    const into = rows.find(t => t.type === 'INCOME')!;
    expect([out.familyId, out.clientId, out.walletId]).toEqual([null, 'eric', ericWallet.id]);
    expect([into.familyId, into.clientId, into.walletId]).toEqual([fam.id, 'eric', home.id]);
  });

  test('each side shows only in its own space', async () => {
    const { w, fam, transfers, home, ericWallet } = await setup();
    await transfers.contribute('eric', fam.id, { personalWalletId: ericWallet.id, familyWalletId: home.id, amount: 1000 });
    const personal: any = await w.transactions.findAll(await w.scopeOf('eric'), {} as any);
    const family: any = await w.transactions.findAll(await w.scopeOf('aline', fam.id), {} as any);
    expect(personal.data.map((t: any) => t.title)).toEqual([`Contribution to Uwase home`]);
    expect(family.data.map((t: any) => t.title)).toEqual([`Contribution from Eric Uwase`]);
  });

  test('a viewer cannot contribute; a stranger is not a member; someone else\'s wallet is not found', async () => {
    const { w, fam, transfers, home, ericWallet } = await setup();
    const grace = await w.wallets.create(await w.scopeOf('grace'), { name: 'G', bank: 'BK', balance: 9000, currency: 'RWF' } as any);
    await expect(transfers.contribute('grace', fam.id, { personalWalletId: grace.id, familyWalletId: home.id, amount: 10 })).rejects.toThrow();
    await expect(transfers.contribute('divine', fam.id, { personalWalletId: ericWallet.id, familyWalletId: home.id, amount: 10 })).rejects.toThrow();
    await expect(transfers.contribute('kevin', fam.id, { personalWalletId: ericWallet.id, familyWalletId: home.id, amount: 10 })).rejects.toThrow();
    expect(w.db.tables.transaction.filter(t => t.transferGroupId)).toHaveLength(0);
  });

  test('refused for too little money, a different currency, an archived wallet or a bad amount, and nothing changes', async () => {
    const { w, fam, transfers, home, ericWallet, bal } = await setup();
    const usd = await w.wallets.create(await w.scopeOf('aline', fam.id), { name: 'Dollars', bank: 'BK', balance: 0, currency: 'USD' } as any);
    for (const dto of [
      { personalWalletId: ericWallet.id, familyWalletId: home.id, amount: 60000 },
      { personalWalletId: ericWallet.id, familyWalletId: usd.id, amount: 10 },
      { personalWalletId: ericWallet.id, familyWalletId: home.id, amount: 0 },
      { personalWalletId: ericWallet.id, familyWalletId: home.id, amount: 'abc' },
    ]) await expect(transfers.contribute('eric', fam.id, dto)).rejects.toThrow();
    w.db.tables.wallet.find(x => x.id === home.id)!.archived = true;
    await expect(transfers.contribute('eric', fam.id, { personalWalletId: ericWallet.id, familyWalletId: home.id, amount: 10 })).rejects.toThrow();
    expect([bal(ericWallet.id), bal(home.id)]).toEqual([50000, 100000]);
    expect(w.db.tables.transaction.filter(t => t.transferGroupId)).toHaveLength(0);
  });

  test('a reimbursement pays a member into their own wallet, notifies them, and only owners and admins can make one', async () => {
    const { w, fam, transfers, home, ericWallet, bal, notes } = await setup();
    await expect(transfers.reimburse('eric', fam.id, { memberId: 'eric', familyWalletId: home.id, amount: 10 })).rejects.toThrow();
    const r: any = await transfers.reimburse('kevin', fam.id, { memberId: 'eric', familyWalletId: home.id, amount: 15000 });
    expect([bal(home.id), bal(ericWallet.id), r.walletId]).toEqual([85000, 65000, ericWallet.id]);
    const rows = w.db.tables.transaction.filter(t => t.transferGroupId === r.groupId);
    expect(rows.find(t => t.type === 'EXPENSE')).toMatchObject({ familyId: fam.id, clientId: 'kevin', walletId: home.id });
    expect(rows.find(t => t.type === 'INCOME')).toMatchObject({ familyId: null, clientId: 'eric', walletId: ericWallet.id });
    expect(notes.some(n => n[0] === 'eric')).toBe(true);
  });

  test('a reimbursement is refused for a non-member, an empty family wallet, or a member without a wallet in that currency', async () => {
    const { w, fam, transfers, home, bal } = await setup();
    await expect(transfers.reimburse('aline', fam.id, { memberId: 'divine', familyWalletId: home.id, amount: 10 })).rejects.toThrow();
    await expect(transfers.reimburse('aline', fam.id, { memberId: 'eric', familyWalletId: home.id, amount: 500000 })).rejects.toThrow();
    // grace has no personal wallet at all
    await expect(transfers.reimburse('aline', fam.id, { memberId: 'grace', familyWalletId: home.id, amount: 10 })).rejects.toThrow();
    expect(bal(home.id)).toBe(100000);
    expect(w.db.tables.transaction.filter(t => t.transferGroupId)).toHaveLength(0);
  });

  test('the options list what each role may use', async () => {
    const { fam, transfers, home, ericWallet } = await setup();
    const eric: any = await transfers.options('eric', fam.id);
    expect([eric.canContribute, eric.canReimburse, eric.personalWallets.map((w: any) => w.id), eric.familyWallets.map((w: any) => w.id), eric.members]).toEqual([true, false, [ericWallet.id], [home.id], []]);
    const kevin: any = await transfers.options('kevin', fam.id);
    expect([kevin.canReimburse, kevin.members.length, kevin.personalWallets.length]).toEqual([true, 4, 0]);
    const grace: any = await transfers.options('grace', fam.id);
    expect([grace.canContribute, grace.personalWallets]).toEqual([false, []]);
    await expect(transfers.options('divine', fam.id)).rejects.toThrow();
  });

  test('one family cannot touch a wallet of another family the person is also in', async () => {
    const { w, fam, transfers, ericWallet } = await setup();
    const other = await w.families.create('eric', { name: 'Eric side' } as any).then((r: any) => r.family ?? r);
    const theirs = await w.wallets.create(await w.scopeOf('eric', other.id), { name: 'Side', bank: 'BK', balance: 0, currency: 'RWF' } as any);
    await expect(transfers.contribute('eric', fam.id, { personalWalletId: ericWallet.id, familyWalletId: theirs.id, amount: 10 })).rejects.toThrow();
  });
});
