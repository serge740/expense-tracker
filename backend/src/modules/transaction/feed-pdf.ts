import PDFDocument from 'pdfkit';
import type { CsvRow } from './feed-csv';

const BRAND = '#00627F';
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** History as a PDF: a title, the totals per currency, then one line per row. Amounts are signed (spending negative). */
export function buildHistoryPdf(rows: CsvRow[], meta: { title: string; subtitle: string; truncated: boolean }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor(BRAND).fontSize(18).text(meta.title);
    doc.fillColor('#555555').fontSize(9).text(meta.subtitle).moveDown(0.6);

    // Totals per currency (transfers are neither in nor out).
    const totals = new Map<string, { in: number; out: number }>();
    for (const r of rows) {
      if (r.type === 'TRANSFER') continue;
      const t = totals.get(r.currency ?? '') ?? { in: 0, out: 0 };
      if (r.amount >= 0) t.in += r.amount; else t.out += -r.amount;
      totals.set(r.currency ?? '', t);
    }
    doc.fillColor('#000000').fontSize(10);
    for (const [cur, t] of totals) doc.text(`${cur || 'No wallet'}   In ${money(t.in)}   Out ${money(t.out)}   Net ${money(t.in - t.out)}`);
    doc.moveDown(0.6);

    const x = [40, 100, 270, 380, 460];
    const head = () => {
      const y = doc.y;
      doc.fillColor(BRAND).fontSize(8.5);
      ['Date', 'Title', 'Category', 'Wallet', 'Amount'].forEach((h, i) => doc.text(h, x[i], y, { width: (x[i + 1] ?? 555) - x[i] - 6, align: i === 4 ? 'right' : 'left' }));
      doc.moveTo(40, y + 12).lineTo(555, y + 12).strokeColor('#CCCCCC').stroke();
      doc.y = y + 17;
    };
    head();
    doc.fillColor('#000000').fontSize(8.5);
    for (const r of rows) {
      if (doc.y > 770) { doc.addPage(); head(); doc.fillColor('#000000').fontSize(8.5); }
      const y = doc.y;
      const cat = r.type === 'TRANSFER' ? 'Transfer' : `${r.category}${r.subCategory ? ' › ' + r.subCategory : ''}`;
      const wallet = r.type === 'TRANSFER' ? `${r.wallet?.name ?? ''} → ${r.transfer?.toWallet?.name ?? ''}` : r.wallet?.name ?? '';
      const cells = [day(r.date), r.title, cat, wallet, `${r.amount >= 0 ? '+' : '-'}${money(Math.abs(r.amount))} ${r.currency ?? ''}`.trim()];
      cells.forEach((c, i) => doc.text(c, x[i], y, { width: (x[i + 1] ?? 555) - x[i] - 6, height: 11, ellipsis: true, lineBreak: false, align: i === 4 ? 'right' : 'left' }));
      doc.y = y + 13;
    }
    if (meta.truncated) doc.moveDown().fillColor('#B45309').fontSize(9).text('Only the first rows are included; narrow the filter to export the rest.');
    doc.end();
  });
}
