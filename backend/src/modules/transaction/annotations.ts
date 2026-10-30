/** Tags and a private note on a transaction. Tags are kept as "|food|trip|" in one column so a single `contains "|trip|"` finds them. */
export const TAG_MAX = 10;
export const TAG_LEN = 24;
export const NOTE_MAX = 1000;

/** What a person typed (a list, or one comma / space separated string) as a clean, de-duplicated list of tags. */
export function cleanTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const tag = t.trim().replace(/^#+/, '').replace(/[|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, TAG_LEN);
    if (tag && !out.some(x => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out.slice(0, TAG_MAX);
}

export const packTags = (tags: string[]): string | null => (tags.length ? `|${tags.join('|')}|` : null);
export const unpackTags = (packed: string | null | undefined): string[] => (packed ? packed.split('|').filter(Boolean) : []);

/** The note as it will be saved: trimmed, capped, empty means none. */
export function cleanNote(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().slice(0, NOTE_MAX);
  return s || null;
}
