export const EXPORT_MAX = 5000;
const HEADER = ['Date', 'Type', 'Title', 'Category', 'Subcategory', 'Amount', 'Currency', 'Wallet', 'To wallet', 'Note', 'Tags', 'Private note'];

/** One cell. Text that a spreadsheet could read as a formula is prefixed with an apostrophe, and anything with a comma, quote or line break is quoted. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export interface CsvRow {
  date: Date | string; type: string; title: string; category: string; subCategory: string | null; amount: number; currency: string | null;
  wallet: { name: string } | null; transfer: { toWallet: { name: string } | null } | null; description: string | null;
  tags?: string[]; note?: string | null;
}

/** The rows of History as a CSV file: one line per row, amounts signed (spending negative). */
export function rowsToCsv(rows: CsvRow[]): string {
  const lines = [HEADER.join(',')];
  for (const r of rows) {
    lines.push([new Date(r.date).toISOString(), r.type, r.title, r.category, r.subCategory, r.amount, r.currency, r.wallet?.name, r.transfer?.toWallet?.name, r.description, (r.tags ?? []).join(' '), r.note].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
