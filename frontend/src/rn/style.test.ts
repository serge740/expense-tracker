import { describe, expect, test } from 'vitest';
import { StyleSheet, flatten, toCss, withOpacity } from './style';

describe('flatten', () => {
  test('merges arrays left to right and ignores falsy entries', () => {
    expect(flatten([{ a: 1, b: 1 }, false, null, undefined, [{ b: 2 }, { c: 3 }]])).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('padding and margin', () => {
  test('horizontal and vertical become sides', () => {
    expect(toCss({ paddingHorizontal: 28, paddingVertical: 4 })).toEqual({ paddingLeft: 28, paddingRight: 28, paddingTop: 4, paddingBottom: 4 });
  });
  test('a single side beats horizontal, which beats the shorthand', () => {
    expect(toCss({ padding: 10, paddingHorizontal: 20, paddingLeft: 30 })).toEqual({ paddingTop: 10, paddingBottom: 10, paddingLeft: 30, paddingRight: 20 });
  });
  test('margin works the same way', () => {
    expect(toCss({ marginVertical: 6, marginTop: 1 })).toEqual({ marginTop: 1, marginBottom: 6 });
  });
  test('leaves styles with none of them untouched', () => {
    expect(toCss({ gap: 4 })).toEqual({ gap: 4 });
  });
});

describe('shadows', () => {
  test('become a box-shadow when the opacity is above zero', () => {
    expect(toCss({ shadowColor: '#1B1F3B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 6 }))
      .toEqual({ boxShadow: '0px 8px 18px rgba(27, 31, 59, 0.08)' });
  });
  test('no shadow when the opacity is zero or missing, as in React Native', () => {
    expect(toCss({ shadowColor: '#000', shadowRadius: 10 })).toEqual({});
  });
});

describe('transforms, line height, borders', () => {
  test('transform lists become a CSS transform string', () => {
    expect(toCss({ transform: [{ rotate: '-8deg' }, { translateY: 12 }, { scale: 1.2 }] }).transform).toBe('rotate(-8deg) translateY(12px) scale(1.2)');
  });
  test('a numeric line height is pixels, not a multiplier', () => {
    expect(toCss({ lineHeight: 22 }).lineHeight).toBe('22px');
  });
  test('a border width gets a solid style', () => {
    expect(toCss({ borderWidth: 1, borderColor: '#000' }).borderStyle).toBe('solid');
    expect(toCss({ borderBottomWidth: 2 }).borderStyle).toBe('solid');
    expect(toCss({ borderWidth: 0 }).borderStyle).toBeUndefined();
  });
  test('a single border side leaves the other sides at zero', () => {
    expect(toCss({ borderTopWidth: 1, borderTopColor: '#eee' })).toMatchObject({ borderTopWidth: 1, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderStyle: 'solid' });
  });
  test('a full border width is left as one value', () => {
    const css = toCss({ borderWidth: 2 }) as Record<string, unknown>;
    expect(css.borderWidth).toBe(2);
    expect(css.borderTopWidth).toBeUndefined();
  });
  test('props that only mean something on a phone are dropped', () => {
    expect(toCss({ elevation: 4, textAlignVertical: 'center', resizeMode: 'cover', color: 'red' })).toEqual({ color: 'red' });
  });
});

describe('fonts', () => {
  test('Poppins_600SemiBold becomes the Poppins family at weight 600', () => {
    expect(toCss({ fontFamily: 'Poppins_600SemiBold' })).toMatchObject({ fontFamily: 'Poppins, "Twemoji Country Flags", system-ui, sans-serif', fontWeight: '600' });
  });
  test('an explicit weight wins over the one in the name', () => {
    expect(toCss({ fontFamily: 'Poppins_400Regular', fontWeight: '700' }).fontWeight).toBe('700');
  });
  test('other families are left alone', () => {
    expect(toCss({ fontFamily: 'monospace' }).fontFamily).toBe('monospace');
  });
});

describe('helpers', () => {
  test('withOpacity handles 3 and 6 digit hex and rgba', () => {
    expect(withOpacity('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withOpacity('rgba(0,98,127,0.5)', 0.5)).toBe('rgba(0, 98, 127, 0.25)');
  });
  test('StyleSheet.create is the identity and absoluteFill fills', () => {
    const o = { a: { flex: 1 } };
    expect(StyleSheet.create(o)).toBe(o);
    expect(StyleSheet.absoluteFill).toMatchObject({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 });
  });
});
