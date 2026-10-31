/** Cleaning what the model read off a receipt, so a wrong guess never reaches the form. */

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;

/** A real calendar day as YYYY-MM-DD, or null (2026-02-30 is not one). */
function ymd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}
const dayNumber = (s: string) => Date.parse(`${s}T00:00:00Z`) / DAY_MS;
export const todayText = (now: Date) => `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;

const MONTH_WORDS: Array<[string, number]> = [['jan', 1], ['janv', 1], ['feb', 2], ['fév', 2], ['fev', 2], ['mar', 3], ['apr', 4], ['avr', 4], ['may', 5], ['mai', 5], ['juin', 6], ['jun', 6], ['juil', 7], ['jul', 7], ['aug', 8], ['aoû', 8], ['aou', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12], ['déc', 12]];
const monthOf = (word: string): number => MONTH_WORDS.find(([p]) => word.startsWith(p))?.[1] ?? 0;

/** Two-digit years mean this century ("25" is 2025); a four-digit one stays as it is. */
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * A date as printed on a receipt (28/10/2026, 28.10.26, 10-28-2026, 2026/10/28, 28 Oct 2026, Oct 28, 2026…) as a day.
 * Numbers with two separators are read day-first (the usual order in Rwanda and Europe) unless that is impossible.
 */
export function parsePrintedDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.trim().toLowerCase();
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    return ymd(y, b, a) ?? ymd(y, a, b);                       // day first, else month first
  }

  m = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-zéûè]{3,9})\.?,?\s+(\d{2,4})/.exec(s);
  if (m && monthOf(m[2]) > 0) return ymd(fullYear(+m[3]), monthOf(m[2]), +m[1]);
  m = /([a-zéûè]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/.exec(s);
  if (m && monthOf(m[1]) > 0) return ymd(fullYear(+m[3]), monthOf(m[1]), +m[2]);
  return null;
}

/**
 * The date to put in the form. The printed text is trusted over the model's own conversion when it can be read,
 * a day-and-month that landed in the future is tried the other way round, and anything still impossible
 * (in the future, or years old) is left empty so the person chooses instead of saving a wrong day.
 */
export function chooseDate(modelDate: unknown, printed: unknown, now = new Date()): { date: string | null; adjusted: boolean } {
  const today = todayText(now);
  const limit = dayNumber(today) + 1;                         // a receipt may carry tomorrow's date at the edge of a time zone
  const ok = (d: string | null) => !!d && dayNumber(d) <= limit && dayNumber(d) >= limit - 366 * 10;
  const fromModel = typeof modelDate === 'string' ? parsePrintedDate(modelDate) : null;
  const fromText = typeof printed === 'string' ? parsePrintedDate(printed) : null;
  if (ok(fromText)) return { date: fromText, adjusted: !!fromModel && fromModel !== fromText };
  if (ok(fromModel)) return { date: fromModel, adjusted: false };
  // Day and month may be the wrong way round (03/04 read as April 3rd instead of March 4th).
  for (const d of [fromText, fromModel]) {
    const m = d && /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (m) { const swapped = ymd(+m[1], +m[3], +m[2]); if (ok(swapped)) return { date: swapped, adjusted: true }; }
  }
  return { date: null, adjusted: !!(fromText || fromModel) };
}

/** An amount the model returned as a number or as text ("12,500", "1.250,50", "RWF 3 400"). Zero, negative or silly values become null. */
export function cleanAmount(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    let s = v.replace(/[^\d.,]/g, '');
    if (!s) return null;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      // Both present: the later one is the decimal mark.
      s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      // 12,500 and 1,250,000 are thousands; 12,5 and 12,50 are decimals.
      s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
    n = Number(s);
  } else return null;
  if (!Number.isFinite(n) || n <= 0 || n > 9_999_999_999) return null;
  return Math.round(n * 100) / 100;
}

/** A three-letter currency code, upper-cased, or null. */
export function cleanCurrency(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

/**
 * The time of day as HH:MM (24 hour), from what the model read or the text printed next to the date
 * ("16:24:37", "4:24 PM", "16h24", "2026-09-18 16:24"). A time that is not real is nothing; midnight on its own
 * (00:00) usually means no time was printed, so it is nothing too.
 */
export function cleanTime(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (typeof src !== 'string') continue;
    const m = /(\d{1,2})\s*[:h.]\s*(\d{2})(?:\s*[:.]\s*\d{2})?\s*([ap]\.?m\.?)?/i.exec(src);
    if (!m) continue;
    let h = +m[1];
    const min = +m[2];
    const ampm = m[3]?.toLowerCase().replace(/\./g, '');
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    if (h === 0 && min === 0 && !ampm) continue;
    return `${pad(h)}:${pad(min)}`;
  }
  return null;
}
