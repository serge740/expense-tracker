import { inflateRawSync } from 'node:zlib';
import { cleanNote, cleanTags, packTags, unpackTags } from './annotations';
import { buildXlsx, crc32 } from './feed-xlsx';
import { buildHistoryPdf } from './feed-pdf';

describe('tags and notes', () => {
  test('tags are cleaned, de-duplicated without caring about case, and capped', () => {
    expect(cleanTags(' #Trip, trip ,Food  Court,|bad|, ')).toEqual(['Trip', 'Food-Court', 'bad']);
    expect(cleanTags(['a', 'A', 5 as never])).toEqual(['a']);
    expect(cleanTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(cleanTags('x'.repeat(60))[0]).toHaveLength(24);
    expect(cleanTags(undefined)).toEqual([]);
  });
  test('packing round-trips and an empty list is no value', () => {
    expect(packTags(['a', 'b'])).toBe('|a|b|');
    expect(unpackTags('|a|b|')).toEqual(['a', 'b']);
    expect(packTags([])).toBeNull();
    expect(unpackTags(null)).toEqual([]);
  });
  test('a note is trimmed and capped; empty means none', () => {
    expect(cleanNote('  hi  ')).toBe('hi');
    expect(cleanNote('   ')).toBeNull();
    expect(cleanNote(5)).toBeNull();
    expect(cleanNote('x'.repeat(2000))).toHaveLength(1000);
  });
});

describe('export files', () => {
  const rows = [{ date: '2026-10-01T10:00:00.000Z', type: 'EXPENSE', title: 'Lunch =HYPERLINK("x") & <b>', category: 'food', subCategory: null, amount: -2500, currency: 'RWF', wallet: { name: 'MoMo' }, transfer: null, description: null, tags: ['trip'], note: 'private' }];

  test('the xlsx is a real zip: signature, every file readable, formulas stay text', () => {
    const buf = buildXlsx('History', ['Date', 'Title', 'Amount'], [['2026-10-01', rows[0].title, -2500]]);
    expect(buf.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50);
    // walk the central directory and inflate each file, checking its CRC
    const count = buf.readUInt16LE(buf.length - 22 + 10);
    let p = buf.readUInt32LE(buf.length - 22 + 16);
    const names: string[] = [];
    let sheet = '';
    for (let i = 0; i < count; i++) {
      const crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
      const name = buf.subarray(p + 46, p + 46 + nameLen).toString();
      const lh = 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const data = inflateRawSync(buf.subarray(off + lh, off + lh + size));
      expect(crc32(data)).toBe(crc);
      names.push(name);
      if (name === 'xl/worksheets/sheet1.xml') sheet = data.toString();
      p += 46 + nameLen;
    }
    expect(names).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('&lt;b&gt;');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('<v>-2500</v>');
  });

  test('the pdf starts like a pdf and has content', async () => {
    const pdf = await buildHistoryPdf(rows as never, { title: 'History', subtitle: '1 rows', truncated: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(800);
  });
});
