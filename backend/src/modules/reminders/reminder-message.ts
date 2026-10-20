import { StepKind } from './reminder-policy';

export type DebtKindName = 'BORROWED' | 'LENT';
export type Lang = 'en' | 'fr' | 'rw' | 'sw';

export interface MessageInput {
  kind: DebtKindName;
  person: string;
  remaining: number;
  currency: string;
  dueAt: Date;
  tz: string;
  step: StepKind;
  lang?: Lang;
}

const LOCALE: Record<Lang, string> = { en: 'en-US', fr: 'fr-FR', rw: 'rw-RW', sw: 'sw-KE' };
export const asLang = (l?: string | null): Lang => (l === 'fr' || l === 'rw' || l === 'sw' ? l : 'en');

export const money = (n: number, currency: string) => {
  const num = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return currency ? `${currency} ${num}` : num;   // a scheduled item without a wallet has no currency
};

/** "Tue, 21 Oct, 6:00 PM" in the person's own time zone (and language, where the runtime knows it). */
export function whenText(at: Date, tz: string, lang: Lang = 'en'): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(at);
}

interface Words {
  dTomorrow: string; dHour: string; dNow: string; dLate: string;
  cTomorrow: string; cHour: string; cNow: string; cLate: string;
  dLead: string; dOver: string; cLead: string; cOver: string;
  digest: string; more: string;
  sTomorrow: string; sHour: string; sNow: string; sLate: string;
  iTomorrow: string; iHour: string; iNow: string; iLate: string;
  sLead: string; sOver: string; iLead: string; iOver: string;
}

const WORDS: Record<Lang, Words> = {
  en: {
    dTomorrow: 'Payment due tomorrow', dHour: 'Payment due in 1 hour', dNow: 'Payment due now', dLate: 'Payment overdue',
    cTomorrow: 'Repayment due tomorrow', cHour: 'Repayment due in 1 hour', cNow: 'Repayment due now', cLate: 'Repayment overdue',
    dLead: 'Pay {person} {amount} by {when}.', dOver: 'Your payment to {person} ({amount}) was due {when}.',
    cLead: '{person} owes you {amount}, due {when}.', cOver: '{person} owes you {amount} since {when}.',
    digest: '{n} payments need attention', more: ' +{k} more',
    sTomorrow: 'Scheduled payment due tomorrow', sHour: 'Scheduled payment due in 1 hour', sNow: 'Scheduled payment due now', sLate: 'Scheduled payment overdue',
    iTomorrow: 'Expected income tomorrow', iHour: 'Expected income in 1 hour', iNow: 'Expected income now', iLate: 'Expected income is late',
    sLead: '{title} · {amount} is due {when}.', sOver: '{title} · {amount} was due {when}.',
    iLead: '{title} · {amount} is expected {when}.', iOver: '{title} · {amount} was expected {when}.',
  },
  fr: {
    dTomorrow: 'Paiement dû demain', dHour: 'Paiement dû dans 1 heure', dNow: 'Paiement dû maintenant', dLate: 'Paiement en retard',
    cTomorrow: 'Remboursement dû demain', cHour: 'Remboursement dû dans 1 heure', cNow: 'Remboursement dû maintenant', cLate: 'Remboursement en retard',
    dLead: 'Payez {person} {amount} avant {when}.', dOver: 'Votre paiement à {person} ({amount}) était dû {when}.',
    cLead: '{person} vous doit {amount}, échéance {when}.', cOver: '{person} vous doit {amount} depuis {when}.',
    digest: '{n} paiements demandent votre attention', more: ' +{k} de plus',
    sTomorrow: 'Paiement prévu demain', sHour: 'Paiement prévu dans 1 heure', sNow: 'Paiement prévu maintenant', sLate: 'Paiement prévu en retard',
    iTomorrow: 'Revenu attendu demain', iHour: 'Revenu attendu dans 1 heure', iNow: 'Revenu attendu maintenant', iLate: 'Revenu attendu en retard',
    sLead: '{title} · {amount} est dû {when}.', sOver: '{title} · {amount} était dû {when}.',
    iLead: '{title} · {amount} est attendu {when}.', iOver: '{title} · {amount} était attendu {when}.',
  },
  rw: {
    dTomorrow: 'Kwishyura bigomba ejo', dHour: 'Kwishyura bigomba mu isaha imwe', dNow: 'Kwishyura bigomba none', dLate: 'Kwishyura byarengeje igihe',
    cTomorrow: 'Kwishyurwa bigomba ejo', cHour: 'Kwishyurwa bigomba mu isaha imwe', cNow: 'Kwishyurwa bigomba none', cLate: 'Kwishyurwa byarengeje igihe',
    dLead: 'Ishyura {person} {amount} bitarenze {when}.', dOver: 'Kwishyura {person} ({amount}) byagombaga {when}.',
    cLead: '{person} agufitiye {amount}, bigomba {when}.', cOver: '{person} agufitiye {amount} kuva {when}.',
    digest: 'Ibyishyurwa {n} bikeneye kwitabwaho', more: ' +{k} bindi',
    sTomorrow: 'Kwishyura byateganyijwe ejo', sHour: 'Kwishyura byateganyijwe mu isaha imwe', sNow: 'Kwishyura byateganyijwe none', sLate: 'Kwishyura byateganyijwe byarengeje igihe',
    iTomorrow: 'Amafaranga ategerejwe ejo', iHour: 'Amafaranga ategerejwe mu isaha imwe', iNow: 'Amafaranga ategerejwe none', iLate: 'Amafaranga ategerejwe yatinze',
    sLead: '{title} · {amount} bigomba {when}.', sOver: '{title} · {amount} byagombaga {when}.',
    iLead: '{title} · {amount} yitezwe {when}.', iOver: '{title} · {amount} yari ategerejwe {when}.',
  },
  sw: {
    dTomorrow: 'Malipo yanatakiwa kesho', dHour: 'Malipo yanatakiwa baada ya saa 1', dNow: 'Malipo yanatakiwa sasa', dLate: 'Malipo yamechelewa',
    cTomorrow: 'Marejesho yanatakiwa kesho', cHour: 'Marejesho yanatakiwa baada ya saa 1', cNow: 'Marejesho yanatakiwa sasa', cLate: 'Marejesho yamechelewa',
    dLead: 'Mlipe {person} {amount} kabla ya {when}.', dOver: 'Malipo yako kwa {person} ({amount}) yalitakiwa {when}.',
    cLead: '{person} anakudai {amount}, tarehe {when}.', cOver: '{person} anakudai {amount} tangu {when}.',
    digest: 'Malipo {n} yanahitaji umakini', more: ' +{k} zaidi',
    sTomorrow: 'Malipo yaliyopangwa kesho', sHour: 'Malipo yaliyopangwa baada ya saa 1', sNow: 'Malipo yaliyopangwa sasa', sLate: 'Malipo yaliyopangwa yamechelewa',
    iTomorrow: 'Mapato yanayotarajiwa kesho', iHour: 'Mapato yanayotarajiwa baada ya saa 1', iNow: 'Mapato yanayotarajiwa sasa', iLate: 'Mapato yanayotarajiwa yamechelewa',
    sLead: '{title} · {amount} yanatakiwa {when}.', sOver: '{title} · {amount} yalitakiwa {when}.',
    iLead: '{title} · {amount} yanatarajiwa {when}.', iOver: '{title} · {amount} yalitarajiwa {when}.',
  },
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));
const isLate = (s: StepKind) => s === 'LATE_30M' || s === 'LATE_2H' || s === 'LATE_DAY';

/** The words for one reminder, in the person's language. */
export function reminderMessage(i: MessageInput): { title: string; body: string; headline: string; late: boolean } {
  const w = WORDS[i.lang ?? 'en'];
  const amount = money(i.remaining, i.currency);
  const when = whenText(i.dueAt, i.tz, i.lang ?? 'en');
  const late = isLate(i.step);
  const debt = i.kind === 'BORROWED';

  const pick = debt
    ? { LEAD_DAY: w.dTomorrow, LEAD_HOUR: w.dHour, DUE: w.dNow }[i.step as 'LEAD_DAY'] ?? w.dLate
    : { LEAD_DAY: w.cTomorrow, LEAD_HOUR: w.cHour, DUE: w.cNow }[i.step as 'LEAD_DAY'] ?? w.cLate;
  const bodyTpl = debt ? (late ? w.dOver : w.dLead) : (late ? w.cOver : w.cLead);

  return { title: pick, headline: pick, late, body: fill(bodyTpl, { person: i.person, amount, when }) };
}

export interface ScheduledMessageInput {
  type: string;            // INCOME | EXPENSE
  title: string;
  amount: number;
  currency: string;
  dueAt: Date;
  tz: string;
  step: StepKind;
  lang?: Lang;
}

/** The words for a reminder about a scheduled transaction (money going out, or expected in). */
export function scheduledMessage(i: ScheduledMessageInput): { title: string; body: string; headline: string; late: boolean } {
  const w = WORDS[i.lang ?? 'en'];
  const late = isLate(i.step);
  const income = i.type === 'INCOME';
  const pick = income
    ? { LEAD_DAY: w.iTomorrow, LEAD_HOUR: w.iHour, DUE: w.iNow }[i.step as 'LEAD_DAY'] ?? w.iLate
    : { LEAD_DAY: w.sTomorrow, LEAD_HOUR: w.sHour, DUE: w.sNow }[i.step as 'LEAD_DAY'] ?? w.sLate;
  const tpl = income ? (late ? w.iOver : w.iLead) : (late ? w.sOver : w.sLead);
  return {
    title: pick, headline: pick, late,
    body: fill(tpl, { title: i.title, amount: money(i.amount, i.currency), when: whenText(i.dueAt, i.tz, i.lang ?? 'en') }),
  };
}

/** One push for a person who has several reminders firing at once. */
export function digestMessage(items: { person: string; remaining: number; currency: string }[], lang: Lang = 'en'): { title: string; body: string } {
  const w = WORDS[lang];
  const shown = items.slice(0, 3).map(x => `${x.person} · ${money(x.remaining, x.currency)}`).join(', ');
  const extra = items.length > 3 ? fill(w.more, { k: items.length - 3 }) : '';
  return { title: fill(w.digest, { n: items.length }), body: `${shown}${extra}` };
}
