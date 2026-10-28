import { describe, expect, test } from '@jest/globals';
import { planAmountError, planPreview } from '@/utils/debt-plan';
import { RepeatRule, blankRule } from '@/utils/recurrence';

const monthly: RepeatRule = { ...blankRule('MONTH'), monthDays: [5] };
const start = new Date(2030, 10, 5, 9, 0);   // 5 Nov 2030, 09:00 (local time)

describe('the summary of an estimated payment', () => {
  test('400,000 at 100,000 a month is four payments, the last on 5 Feb', () => {
    const p = planPreview({ loanAmount: 400_000, planAmount: 100_000, rule: monthly, start })!;
    expect(p.payments).toBe(4);
    expect(p.shortfall).toBe(0);
    expect(p.lastAt!.getFullYear()).toBe(2031);
    expect(p.lastAt!.getMonth()).toBe(1);
    expect(p.lastAt!.getDate()).toBe(5);
  });

  test('a part payment at the end still counts as a payment', () => {
    expect(planPreview({ loanAmount: 350_000, planAmount: 100_000, rule: monthly, start })!.payments).toBe(4);
  });

  test('an estimate as big as the whole loan is one payment, on the first date', () => {
    const p = planPreview({ loanAmount: 100_000, planAmount: 100_000, rule: monthly, start })!;
    expect(p.payments).toBe(1);
    expect(p.lastAt!.getTime()).toBe(start.getTime());
  });

  test('a rule that ends first says how much it would leave, and has no last date', () => {
    const short: RepeatRule = { ...monthly, ends: { type: 'after', count: 2 } };
    const p = planPreview({ loanAmount: 400_000, planAmount: 100_000, rule: short, start })!;
    expect(p.payments).toBe(2);
    expect(p.shortfall).toBe(200_000);
    expect(p.lastAt).toBeNull();
  });

  test('weekly, every 2 weeks and daily all work', () => {
    const weekly: RepeatRule = { ...blankRule('WEEK'), weekdays: [2] };
    expect(planPreview({ loanAmount: 50_000, planAmount: 10_000, rule: weekly, start })!.payments).toBe(5);
    const fortnight: RepeatRule = { ...weekly, every: 2 };
    const f = planPreview({ loanAmount: 30_000, planAmount: 10_000, rule: fortnight, start })!;
    expect(f.payments).toBe(3);
    expect(Math.round((f.lastAt!.getTime() - start.getTime()) / 86_400_000)).toBe(28);
    expect(planPreview({ loanAmount: 3_000, planAmount: 1_000, rule: blankRule('DAY'), start })!.payments).toBe(3);
  });

  test('an existing loan counts only the dates still ahead', () => {
    const p = planPreview({ loanAmount: 200_000, planAmount: 100_000, rule: monthly, start, from: new Date(2031, 0, 20) })!;
    expect(p.payments).toBe(2);
    expect(p.lastAt!.getMonth()).toBe(2);        // 5 Feb and 5 Mar
  });

  test('nothing to work out without a loan and an amount', () => {
    expect(planPreview({ loanAmount: 0, planAmount: 100, rule: monthly, start })).toBeNull();
    expect(planPreview({ loanAmount: 100, planAmount: 0, rule: monthly, start })).toBeNull();
  });
});

describe('the amount that was typed', () => {
  test('must be a positive number, no bigger than the loan', () => {
    expect(planAmountError('100,000', 400_000)).toBeNull();
    expect(planAmountError('400000', 400_000)).toBeNull();
    expect(planAmountError('400001', 400_000)).toBe('plan.errAmount');
    expect(planAmountError('0', 400_000)).toBe('plan.errAmount');
    expect(planAmountError('', 400_000)).toBe('plan.errAmount');
    expect(planAmountError('abc', 400_000)).toBe('plan.errAmount');
  });
});
