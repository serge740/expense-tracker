import { describe, expect, test } from 'vitest';
import { applySearchTokens, rememberSearch, suggest, words, type SearchContext } from '@/utils/history-search';
import { emptyFilter } from '@/utils/history';
import { thisMonth } from '@/utils/period';

const ctx: SearchContext = {
  wallets: [{ id: 'w1', name: 'Main account' }, { id: 'w2', name: 'MoMo' }, { id: 'w3', name: 'Dollar savings' }],
  categories: [{ slug: 'food', name: 'Food' }, { slug: 'bills', name: 'Bills' }, { slug: 'health', name: 'Personal' }],
};
const base = () => emptyFilter(thisMonth(new Date(2026, 9, 29)));

describe('words', () => {
  test('splits on spaces and keeps quotes together', () => {
    expect(words('pizza wallet:"Main account"  >5000')).toEqual(['pizza', 'wallet:"Main account"', '>5000']);
    expect(words('')).toEqual([]);
  });
});

describe('search words that become filters', () => {
  test('a finished wallet word picks the wallet, the rest stays as text', () => {
    const r = applySearchTokens('pizza wallet:momo ', base(), ctx);
    expect(r.filter.walletIds).toEqual(['w2']);
    expect(r.rest).toBe('pizza');
    expect(r.applied).toEqual(['wallet:momo']);
  });
  test('the word being typed waits until it is finished (or Enter)', () => {
    expect(applySearchTokens('wallet:mo', base(), ctx).filter.walletIds).toEqual([]);
    expect(applySearchTokens('wallet:mo', base(), ctx).rest).toBe('wallet:mo');
    expect(applySearchTokens('wallet:mo', base(), ctx, true).filter.walletIds).toEqual(['w2']);
  });
  test('quoted names, matched by start or by part', () => {
    expect(applySearchTokens('wallet:"main acc" ', base(), ctx).filter.walletIds).toEqual(['w1']);
    expect(applySearchTokens('wallet:dollar ', base(), ctx).filter.walletIds).toEqual(['w3']);
  });
  test('categories by name or by slug, and a minus leaves one out', () => {
    expect(applySearchTokens('cat:food ', base(), ctx).filter.include).toEqual([{ c: 'food' }]);
    expect(applySearchTokens('cat:personal ', base(), ctx).filter.include).toEqual([{ c: 'health' }]);
    const r = applySearchTokens('-cat:bills ', base(), ctx);
    expect(r.filter.exclude).toEqual([{ c: 'bills' }]);
    expect(r.filter.include).toEqual([]);
  });
  test('amounts', () => {
    expect(applySearchTokens('>5000 ', base(), ctx).filter.minAmount).toBe(5000);
    expect(applySearchTokens('<200.50 ', base(), ctx).filter.maxAmount).toBe(200.5);
    expect(applySearchTokens('>=100 <=900 ', base(), ctx).filter).toMatchObject({ minAmount: 100, maxAmount: 900 });
  });
  test('type and receipt', () => {
    expect(applySearchTokens('type:income type:transfer ', base(), ctx).filter.kinds).toEqual(['income', 'transfer']);
    expect(applySearchTokens('receipt:no ', base(), ctx).filter.receipt).toBe('without');
    expect(applySearchTokens('receipt:yes ', base(), ctx).filter.receipt).toBe('with');
  });
  test('a word that matches nothing stays as text, never lost', () => {
    const r = applySearchTokens('wallet:nothing cat:xyz type:bogus >abc ', base(), ctx);
    expect(r.rest).toBe('wallet:nothing cat:xyz type:bogus >abc');
    expect(r.applied).toEqual([]);
    expect(r.filter).toEqual(base());
  });
  test('the same wallet twice is added once', () => {
    expect(applySearchTokens('wallet:momo wallet:momo ', base(), ctx).filter.walletIds).toEqual(['w2']);
  });
});

describe('suggestions and recent searches', () => {
  test('wallets and categories that start like the typed word', () => {
    expect(suggest('mo', ctx)).toEqual({ wallets: [ctx.wallets[1]], categories: [] });
    expect(suggest('f', ctx).categories).toEqual([ctx.categories[0]]);
    expect(suggest('sav', ctx).wallets).toEqual([ctx.wallets[2]]);
  });
  test('nothing for filters being typed or empty text', () => {
    expect(suggest('', ctx)).toEqual({ wallets: [], categories: [] });
    expect(suggest('wallet:m', ctx)).toEqual({ wallets: [], categories: [] });
    expect(suggest('>50', ctx)).toEqual({ wallets: [], categories: [] });
  });
  test('recent searches: newest first, no repeats, a short list', () => {
    let l: string[] = [];
    for (const t of ['pizza', 'jean', 'Pizza', 'a', 'rent', 'moto', 'bus', 'cafe', 'gym']) l = rememberSearch(l, t);
    expect(l[0]).toBe('gym');
    expect(l.length).toBe(6);
    expect(l.filter(x => x.toLowerCase() === 'pizza').length).toBeLessThanOrEqual(1);
    expect(l).not.toContain('a');
  });
});
