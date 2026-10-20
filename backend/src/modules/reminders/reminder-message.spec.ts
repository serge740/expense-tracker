import { asLang, digestMessage, money, reminderMessage, whenText } from './reminder-message';
import { StepKind } from './reminder-policy';

const dueAt = new Date(Date.UTC(2026, 9, 21, 16, 0)); // 18:00 Kigali
const base = { kind: 'BORROWED' as const, person: 'John', remaining: 150000, currency: 'RWF', dueAt, tz: 'Africa/Kigali' };
const msg = (step: StepKind, kind: 'BORROWED' | 'LENT' = 'BORROWED') => reminderMessage({ ...base, kind, step });

describe('reminder messages', () => {
  it('formats money and time in the person\'s own zone', () => {
    expect(money(150000, 'RWF')).toBe('RWF 150,000');
    expect(money(12.5, 'USD')).toBe('USD 12.5');
    expect(whenText(dueAt, 'Africa/Kigali')).toContain('6:00 PM');
    expect(whenText(dueAt, 'America/New_York')).toContain('12:00 PM');
  });

  it('debt: counts down, then turns to overdue wording', () => {
    expect(msg('LEAD_DAY').title).toBe('Payment due tomorrow');
    expect(msg('LEAD_HOUR').title).toBe('Payment due in 1 hour');
    expect(msg('DUE').title).toBe('Payment due now');
    for (const s of ['LATE_30M', 'LATE_2H', 'LATE_DAY'] as StepKind[]) {
      expect(msg(s).title).toBe('Payment overdue');
      expect(msg(s).late).toBe(true);
    }
    expect(msg('LEAD_DAY').late).toBe(false);
  });

  it('debt body names the person, the amount left and the time', () => {
    const b = msg('LEAD_DAY').body;
    expect(b).toContain('John');
    expect(b).toContain('RWF 150,000');
    expect(b).toContain('6:00 PM');
    expect(b.startsWith('Pay ')).toBe(true);
    expect(msg('LATE_DAY').body).toContain('was due');
  });

  it('credit is worded from the lender\'s side', () => {
    expect(msg('LEAD_DAY', 'LENT').title).toBe('Repayment due tomorrow');
    expect(msg('DUE', 'LENT').body).toBe(`John owes you RWF 150,000, due ${whenText(dueAt, 'Africa/Kigali')}.`);
    expect(msg('LATE_2H', 'LENT').title).toBe('Repayment overdue');
    expect(msg('LATE_2H', 'LENT').body).toContain('since');
  });

  it('digest lists up to three and counts the rest', () => {
    const items = ['A', 'B', 'C', 'D', 'E'].map(p => ({ person: p, remaining: 1000, currency: 'RWF' }));
    const d = digestMessage(items);
    expect(d.title).toBe('5 payments need attention');
    expect(d.body).toBe('A · RWF 1,000, B · RWF 1,000, C · RWF 1,000 +2 more');
    expect(digestMessage(items.slice(0, 3)).body).not.toContain('more');
  });

  it.each(['en', 'fr', 'rw', 'sw'] as const)('%s: every step, kind and the digest is fully filled in', lang => {
    const steps: StepKind[] = ['LEAD_DAY', 'LEAD_HOUR', 'DUE', 'LATE_30M', 'LATE_2H', 'LATE_DAY'];
    for (const kind of ['BORROWED', 'LENT'] as const) {
      for (const step of steps) {
        const m = reminderMessage({ ...base, kind, step, lang });
        expect(m.title.trim()).not.toBe('');
        expect(`${m.title} ${m.body}`).not.toMatch(/[{}]/);
        expect(m.body).toContain('John');
      }
    }
    const d = digestMessage(Array.from({ length: 5 }, (_, i) => ({ person: 'P' + i, remaining: 1, currency: 'RWF' })), lang);
    expect(`${d.title} ${d.body}`).not.toMatch(/[{}]/);
    expect(d.title).toContain('5');
  });

  it('translates into French', () => {
    expect(reminderMessage({ ...base, step: 'DUE', lang: 'fr' }).title).toBe('Paiement dû maintenant');
  });

  it('falls back to English for an unknown language', () => {
    expect(asLang('xx')).toBe('en');
    expect(asLang(null)).toBe('en');
    expect(asLang('sw')).toBe('sw');
  });
});
