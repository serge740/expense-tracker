import { buildDebtStatementPdf } from './debt-statement-pdf';

const base = {
  kind: 'BORROWED' as const, person: 'John', currency: 'RWF', amount: 200000, paid: 80000, writtenOffAmount: 0, remaining: 120000,
  status: 'OPEN', date: '2030-10-12T10:00:00Z', payments: [], installments: [],
};

describe('buildDebtStatementPdf', () => {
  it('produces a real PDF for a debt with payments and pay dates', async () => {
    const pdf = await buildDebtStatementPdf({
      ...base, spent: 50000,
      payments: [{ amount: 80000, date: '2030-10-18T10:00:00Z', note: 'first' }],
      installments: [{ dueAt: '2030-11-01T09:00:00Z', plannedAmount: 60000, view: 'PENDING' }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(800);
  });

  it('works for an empty credit, with nothing paid and no dates', async () => {
    const pdf = await buildDebtStatementPdf({ ...base, kind: 'LENT', paid: 0, remaining: 200000 });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
