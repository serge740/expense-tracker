import PDFDocument from 'pdfkit';

export interface StatementInput {
  kind: 'BORROWED' | 'LENT';
  person: string;
  phone?: string | null;
  currency: string;
  amount: number;
  paid: number;
  writtenOffAmount: number;
  remaining: number;
  spent?: number;
  status: string;
  date: Date | string;
  note?: string | null;
  payments: { amount: number; date: Date | string; note?: string | null }[];
  installments: { dueAt: Date | string; plannedAmount: number | null; view?: string }[];
  /** The estimated payment plan of a loan, when it has one. */
  plan?: { amount: number; finishesAt: Date | string | null; paymentsLeft: number } | null;
}

const BRAND = '#00627F';
const money = (n: number, cur: string) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`;
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/** One-page-ish statement for a single debt or credit: totals, every payment, every pay date. */
export function buildDebtStatementPdf(d: StatementInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const lent = d.kind === 'LENT';
    doc.fontSize(20).fillColor(BRAND).text(`Rabbit Tracker — ${lent ? 'Debt' : 'Loan'} statement`);
    doc.fontSize(9).fillColor('#888888').text(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    doc.moveDown(1);

    const row = (label: string, value: string) => {
      doc.fontSize(10).fillColor('#555555').text(`${label} `, { continued: true });
      doc.fillColor('#111111').text(value || '—');
      doc.moveDown(0.15);
    };
    row(lent ? 'Lent to:' : 'Borrowed from:', d.person);
    if (d.phone) row('Phone:', d.phone);
    row('Started:', day(d.date));
    row('Status:', d.status);
    row('Total:', money(d.amount, d.currency));
    row(lent ? 'Received:' : 'Paid:', money(d.paid, d.currency));
    if (d.writtenOffAmount > 0) row('Forgiven:', money(d.writtenOffAmount, d.currency));
    row('Left:', money(d.remaining, d.currency));
    if (!lent && d.spent !== undefined) row('Spent from this loan:', money(d.spent, d.currency));
    if (d.plan) {
      row('Estimated payment:', `${money(d.plan.amount, d.currency)} each pay date`);
      row('Estimated last payment:', d.plan.finishesAt ? day(d.plan.finishesAt) : 'not reached by the plan');
    }
    if (d.note) row('Note:', d.note);

    doc.moveDown(0.8).fontSize(13).fillColor('#111111').text('Payments');
    doc.moveDown(0.3);
    if (!d.payments.length) doc.fontSize(10).fillColor('#888888').text('No payments yet.');
    for (const p of d.payments) {
      doc.fontSize(10).fillColor('#111111').text(`${day(p.date)}   ${money(p.amount, d.currency)}${p.note ? `   ${p.note}` : ''}`);
    }

    doc.moveDown(0.8).fontSize(13).fillColor('#111111').text('Pay dates');
    doc.moveDown(0.3);
    if (!d.installments.length) doc.fontSize(10).fillColor('#888888').text('No pay dates set.');
    for (const i of d.installments) {
      const planned = i.plannedAmount ? `   planned ${money(i.plannedAmount, d.currency)}` : '';
      doc.fontSize(10).fillColor('#111111').text(`${day(i.dueAt)}${planned}${i.view ? `   ${i.view}` : ''}`);
    }

    doc.end();
  });
}
