import { makeWorld } from './family.fake';
import { TransactionFeedService } from '../transaction/transaction-feed.service';

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER']]);
  const feed = new TransactionFeedService(w.db as any, { rate: async () => 1 } as any);
  const owner = await w.scopeOf('aline', fam.id);
  const eric = await w.scopeOf('eric', fam.id);
  const grace = await w.scopeOf('grace', fam.id);
  const personal = await w.scopeOf('aline');
  const home = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 100000, currency: 'RWF' } as any);
  const mine = await w.wallets.create(personal, { name: 'Mine', bank: 'BK', balance: 100000, currency: 'RWF' } as any);
  const add = (s: any, wallet: any, title: string, extra: Record<string, unknown> = {}) => w.transactions.create(s, { type: 'EXPENSE', category: 'shopping', title, amount: 100, walletId: wallet.id, ...extra } as any) as Promise<any>;
  return { w, feed, owner, eric, grace, personal, home, mine, add };
}

describe('tags and notes on rows', () => {
  test('tags and a note can be given when adding, and are cleaned', async () => {
    const { add, home, owner, w } = await setup();
    await add(owner, home, 'Rent', { tags: '#Trip, trip, food', note: '  for May  ' });
    expect(w.db.tables.transaction[0]).toMatchObject({ tags: '|Trip|food|', note: 'for May' });
  });

  test('annotating sets and clears; a member edits only their own row; a viewer cannot; a stranger finds nothing', async () => {
    const { add, home, owner, eric, grace, feed, w } = await setup();
    const mine: any = await add(eric, home, 'Mine');
    const other: any = await add(owner, home, 'Owners');
    expect(await feed.annotate(eric, mine.id, { tags: ['a', 'b'], note: 'hello' })).toMatchObject({ tags: ['a', 'b'], note: 'hello' });
    await expect(feed.annotate(eric, other.id, { note: 'x' })).rejects.toMatchObject({ response: { code: 'FORBIDDEN_ACTION' } });
    await expect(feed.annotate(grace, mine.id, { note: 'x' })).rejects.toThrow();
    expect(await feed.annotate(owner, mine.id, { tags: [] })).toMatchObject({ tags: [], note: 'hello' });
    expect(w.db.tables.transaction.find(t => t.id === mine.id)!.tags).toBeNull();
    await expect(feed.annotate(await w.scopeOf('aline'), mine.id, { note: 'x' })).rejects.toThrow();   // from Personal the family row is not there
  });

  test('the tags in use are counted per space', async () => {
    const { add, home, mine, owner, personal, feed } = await setup();
    await add(owner, home, 'A', { tags: 'trip,food' });
    await add(owner, home, 'B', { tags: 'Trip' });
    await add(personal, mine, 'C', { tags: 'private' });
    expect((await feed.tagsInUse(owner)).items).toEqual([{ tag: 'trip', count: 2 }, { tag: 'food', count: 1 }].map(x => (x.tag === 'trip' ? { tag: 'trip', count: 2 } : x)));
    expect((await feed.tagsInUse(personal)).items).toEqual([{ tag: 'private', count: 1 }]);
  });

  test('keeping rows as "not duplicates" only reaches the caller’s own space', async () => {
    const { add, home, mine, owner, personal, feed, w } = await setup();
    const a: any = await add(owner, home, 'A');
    const p: any = await add(personal, mine, 'P');
    expect(await feed.keepDuplicates(owner, [a.id, p.id])).toEqual({ kept: 1 });
    expect(w.db.tables.transaction.find(t => t.id === p.id)!.dupeKept).toBeFalsy();
    await expect(feed.keepDuplicates(owner, [])).rejects.toThrow();
  });
});
