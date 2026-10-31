import { chooseDate, cleanAmount, cleanCurrency, cleanTime, parsePrintedDate } from './receipt-fields';

const now = new Date('2026-10-30T12:00:00Z');

describe('printed dates', () => {
  test.each([
    ['28/10/2026', '2026-10-28'], ['28.10.26', '2026-10-28'], ['2026-10-28', '2026-10-28'], ['2026/10/28 14:03', '2026-10-28'],
    ['03/04/2026', '2026-04-03'],                       // day first
    ['10/28/2026', '2026-10-28'],                       // only month first makes sense
    ['28 Oct 2026', '2026-10-28'], ['Oct 28, 2026', '2026-10-28'], ['5th March 2026', '2026-03-05'], ['12 févr. 2026', '2026-02-12'], ['3 juin 2026', '2026-06-03'],
  ])('%s', (text, day) => expect(parsePrintedDate(text)).toBe(day));
  test('impossible or missing dates are nothing', () => {
    for (const bad of ['31/02/2026', '99/99/2026', 'yesterday', '', null, undefined]) expect(parsePrintedDate(bad as never)).toBeNull();
  });
});

describe('choosing the date', () => {
  test('the printed text wins over the model’s own conversion, and says it changed it', () => {
    expect(chooseDate('2026-05-10', '05/10/2026', now)).toEqual({ date: '2026-10-05', adjusted: true });
  });
  test('a plain, sensible date is used as it is', () => {
    expect(chooseDate('2026-10-28', '28/10/2026', now)).toEqual({ date: '2026-10-28', adjusted: false });
    expect(chooseDate('2026-10-28', null, now)).toEqual({ date: '2026-10-28', adjusted: false });
  });
  test('a date in the future is tried the other way round, otherwise left empty', () => {
    expect(chooseDate('2026-11-03', null, now)).toEqual({ date: '2026-03-11', adjusted: true });
    expect(chooseDate('2027-02-20', null, now)).toEqual({ date: null, adjusted: true });
  });
  test('tomorrow is allowed (time zones); a year long gone is not', () => {
    expect(chooseDate('2026-10-31', null, now).date).toBe('2026-10-31');
    expect(chooseDate('2012-01-02', null, now).date).toBeNull();
  });
  test('nothing printed is nothing, not a guess', () => {
    expect(chooseDate(null, null, now)).toEqual({ date: null, adjusted: false });
  });
});

describe('amounts and currency', () => {
  test.each([
    [12500, 12500], ['12,500', 12500], ['1,250,000', 1250000], ['1.250,50', 1250.5], ['1,250.50', 1250.5], ['RWF 3 400', 3400], ['12,5', 12.5], ['4.25', 4.25], ['1.250.000', 1250000],
  ])('%s', (v, n) => expect(cleanAmount(v)).toBe(n));
  test('zero, negative, text and huge values are nothing', () => {
    for (const bad of [0, -5, 'abc', null, undefined, NaN, 1e12, '']) expect(cleanAmount(bad as never)).toBeNull();
  });
  test('currency codes', () => {
    expect(cleanCurrency(' rwf ')).toBe('RWF');
    expect(cleanCurrency('Francs')).toBeNull();
  });
});

describe('time of day', () => {
  test.each([
    ['16:24:37', '16:24'], ['2026-09-18 16:24:37', '16:24'], ['4:24 PM', '16:24'], ['12:05 AM', '00:05'], ['12:30 pm', '12:30'], ['16h24', '16:24'], ['09.05', '09:05'], ['7:00', '07:00'],
  ])('%s', (text, t) => expect(cleanTime(text)).toBe(t));
  test('nothing printed, impossible times and a lone midnight are nothing; the first readable source wins', () => {
    for (const bad of [null, undefined, '', 'no time', '25:10', '10:75', '00:00', 5]) expect(cleanTime(bad)).toBeNull();
    expect(cleanTime(null, '2026-09-18 16:24:37')).toBe('16:24');
    expect(cleanTime('08:15', '2026-09-18 16:24:37')).toBe('08:15');
  });
});
