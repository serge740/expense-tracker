import { csvCell, rowsToCsv } from './feed-csv';

describe('History CSV', () => {
  test('cells with commas, quotes or line breaks are quoted', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(-2500)).toBe('-2500');
  });
  test('text a spreadsheet would run as a formula is defused', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-5 off')).toBe("'-5 off");
  });
  test('one line per row under a header, spending negative', () => {
    const out = rowsToCsv([{ date: '2026-10-01T10:00:00.000Z', type: 'EXPENSE', title: 'Lunch, big', category: 'food', subCategory: null, amount: -2500, currency: 'RWF', wallet: { name: 'MoMo' }, transfer: null, description: null }]);
    expect(out.split('\r\n')).toEqual(['Date,Type,Title,Category,Subcategory,Amount,Currency,Wallet,To wallet,Note,Tags,Private note', '2026-10-01T10:00:00.000Z,EXPENSE,"Lunch, big",food,,-2500,RWF,MoMo,,,,', '']);
  });
});
