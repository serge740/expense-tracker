import { describe, expect, test } from 'vitest';
import { STRINGS } from '@/i18n/strings';
import type { DebtInstallment, InstallmentView } from '@/services/debt.service';
import { canChange, closedTag, hasHistory, isHistory, ROLE_TAG, VIEW_STYLE, visibleInstallments } from '@/utils/debt';

const inst = (id: string, dueAt: string, view: InstallmentView): DebtInstallment => ({
  id, dueAt, view, plannedAmount: 100, status: view === 'MOVED' ? 'MOVED' : view === 'SKIPPED' ? 'SKIPPED' : 'PENDING',
  covered: 0, movedFromId: null, note: null,
});

const list = [
  inst('c', '2026-11-02T09:00:00Z', 'UPCOMING'),
  inst('a', '2026-10-15T18:00:00Z', 'PAID'),
  inst('m', '2026-10-25T09:00:00Z', 'MOVED'),
  inst('s', '2026-10-28T09:00:00Z', 'SKIPPED'),
];

describe('pay-date helpers', () => {
  test('active dates are listed oldest first and history is hidden by default', () => {
    expect(visibleInstallments(list, false).map(i => i.id)).toEqual(['a', 'c']);
  });

  test('history shows moved and skipped dates in date order', () => {
    expect(visibleInstallments(list, true).map(i => i.id)).toEqual(['a', 'm', 's', 'c']);
  });

  test('does not reorder the caller\'s array', () => {
    const copy = [...list];
    visibleInstallments(list, true);
    expect(list).toEqual(copy);
  });

  test('only unpaid, non-history dates can be moved or skipped', () => {
    expect(canChange(inst('x', '2026-11-01T00:00:00Z', 'UPCOMING'))).toBe(true);
    expect(canChange(inst('x', '2026-11-01T00:00:00Z', 'OVERDUE'))).toBe(true);
    expect(canChange(inst('x', '2026-11-01T00:00:00Z', 'PARTIAL'))).toBe(true);
    expect(canChange(inst('x', '2026-11-01T00:00:00Z', 'PAID'))).toBe(false);
    expect(canChange(inst('x', '2026-11-01T00:00:00Z', 'MOVED'))).toBe(false);
    expect(canChange(inst('x', '2026-11-01T00:00:00Z', 'SKIPPED'))).toBe(false);
  });

  test('history is detected only when something was moved or skipped', () => {
    expect(hasHistory(list)).toBe(true);
    expect(hasHistory(list.filter(i => !isHistory(i)))).toBe(false);
  });
});

describe('labels', () => {
  test('every state, role and outcome points at a real translated string', () => {
    const keys = [
      ...Object.values(VIEW_STYLE).map(v => v.label),
      ...Object.values(ROLE_TAG).map(v => v.label),
      closedTag('FORGIVEN')!.label, closedTag('WRITTEN_OFF')!.label, closedTag('SETTLED')!.label,
    ];
    for (const code of ['en', 'fr', 'rw', 'sw'] as const) {
      for (const k of keys) expect({ code, k, ok: !!STRINGS[code][k] }).toEqual({ code, k, ok: true });
    }
  });

  test('an open record has no outcome tag', () => {
    expect(closedTag('OPEN')).toBeNull();
  });

  test('a forgiven debt and a written-off credit are not shown as "settled"', () => {
    expect(closedTag('FORGIVEN')!.label).not.toBe('debts.settled');
    expect(closedTag('WRITTEN_OFF')!.label).not.toBe('debts.settled');
    expect(closedTag('SETTLED')!.label).toBe('debts.settled');
  });

  test('borrowing is neutral, paying out is red, being repaid is green', () => {
    expect(ROLE_TAG.BORROW_IN.tone).toBe('blue');
    expect(ROLE_TAG.REPAY_OUT.tone).toBe('red');
    expect(ROLE_TAG.REPAY_IN.tone).toBe('green');
  });
});
