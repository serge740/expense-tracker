import { describe, expect, test } from 'vitest';
import { activityText, colorFor, daysLeft, initialsOf } from '@/utils/family-format';
import { STRINGS } from '@/i18n/strings';
import type { ActivityRow } from '@/services/family.service';

describe('initialsOf', () => {
  test('two names give two letters, one name gives one, anything else a question mark', () => {
    expect(initialsOf('Aline Uwase')).toBe('AU');
    expect(initialsOf('  grace   mukamana  uwase ')).toBe('GU');         // first and last
    expect(initialsOf('Eric')).toBe('E');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
    expect(initialsOf(undefined)).toBe('?');
  });
  test('works with accents and letters outside the basic alphabet', () => {
    expect(initialsOf('élodie Ndayisenga')).toBe('ÉN');
  });
});

describe('colorFor', () => {
  test('is the same for the same person, always a real colour, and spreads people out', () => {
    expect(colorFor('aline')).toBe(colorFor('aline'));
    expect(colorFor('aline')).toMatch(/^#[0-9A-F]{6}$/i);
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(colorFor)).size).toBeGreaterThan(3);
    expect(colorFor(undefined)).toMatch(/^#/);
  });
});

describe('daysLeft', () => {
  const now = Date.parse('2030-01-01T12:00:00Z');
  test('counts whole days, rounding up, and goes to zero or below once over', () => {
    expect(daysLeft('2030-01-08T12:00:00Z', now)).toBe(7);
    expect(daysLeft('2030-01-01T18:00:00Z', now)).toBe(1);
    expect(daysLeft('2030-01-01T12:00:00Z', now)).toBe(0);
    expect(daysLeft('2029-12-30T12:00:00Z', now)).toBeLessThan(0);
  });
});

describe('activityText', () => {
  const t = (key: string, vars: Record<string, string | number> = {}) => (STRINGS.en as Record<string, string>)[key].replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
  const row = (action: string, over: Partial<ActivityRow> = {}): ActivityRow => ({
    id: 'a', action, createdAt: '2030-01-01T00:00:00Z', meta: null, actor: { clientId: 'c1', name: 'Aline Uwase' }, target: { clientId: 'c2', name: 'Grace Uwase' }, ...over,
  });
  test.each([
    ['family.created', 'Aline Uwase created the family'], ['family.updated', 'Aline Uwase changed the family settings'], ['family.archived', 'Aline Uwase deleted the family'],
    ['member.joined', 'Aline Uwase joined'], ['member.left', 'Aline Uwase left'], ['member.removed', 'Aline Uwase removed Grace Uwase'],
    ['ownership.transferred', 'Aline Uwase made Grace Uwase the owner'], ['invite.revoked', 'Aline Uwase revoked an invite'], ['invite.revoked_all', 'Aline Uwase revoked all invites'],
    ['something.new', 'Aline Uwase made a change'],
  ])('%s reads "%s"', (action, sentence) => {
    expect(activityText(row(action), t)).toBe(sentence);
  });
  test('a role change says the new role, an invite says the offered one', () => {
    expect(activityText(row('member.role_changed', { meta: { from: 'MEMBER', to: 'ADMIN' } }), t)).toBe('Aline Uwase made Grace Uwase Admin');
    expect(activityText(row('invite.created', { meta: { role: 'VIEWER' } }), t)).toBe('Aline Uwase invited someone as Viewer');
  });
  test('a person who has left the app is "Someone", never blank', () => {
    expect(activityText(row('member.removed', { actor: { clientId: 'x', name: '' }, target: null }), t)).toBe('Someone removed Someone');
  });
});
