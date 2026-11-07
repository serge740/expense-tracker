/**
 * The date a link asks for. A plain day (a scanned receipt says 2026-10-28) is that day on the person's own calendar at the current
 * time of day; reading it as UTC midnight shows the day before in some time zones. A full moment (duplicate, repeat) is used as it is.
 */
export function dateFromParam(raw?: string | null, now = new Date(), time?: string | null): Date {
  if (!raw) return now;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (day) {
    // The time printed on the receipt (HH:MM) when there is one, otherwise the time of day it is now.
    const t = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
    const hh = t && +t[1] < 24 && +t[2] < 60 ? +t[1] : now.getHours();
    const mm = t && +t[1] < 24 && +t[2] < 60 ? +t[2] : now.getMinutes();
    const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), hh, mm);
    // A day that does not exist (2026-02-30) or lies ahead of today is not trusted.
    if (d.getMonth() !== Number(day[2]) - 1) return now;
    return d.getTime() > now.getTime() ? now : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? now : d;
}
