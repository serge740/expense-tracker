import { describe, expect, test } from 'vitest';
import { AnimatedValue, Easing, interpolate, resolveAnimated } from './animated';

describe('Easing', () => {
  test('every curve starts at 0 and ends at 1', () => {
    for (const f of [Easing.linear, Easing.ease, Easing.quad, Easing.cubic, Easing.out(Easing.cubic), Easing.inOut(Easing.ease), Easing.out(Easing.exp), Easing.bezier(0.25, 0.1, 0.25, 1)]) {
      expect(f(0)).toBeCloseTo(0, 2);
      expect(f(1)).toBeCloseTo(1, 2);
    }
  });
  test('ease-out is ahead of linear in the middle, ease-in is behind', () => {
    expect(Easing.out(Easing.cubic)(0.5)).toBeGreaterThan(0.5);
    expect(Easing.cubic(0.5)).toBeLessThan(0.5);
  });
  test('inOut is symmetric', () => {
    const f = Easing.inOut(Easing.quad);
    expect(f(0.5)).toBeCloseTo(0.5, 5);
    expect(f(0.25) + f(0.75)).toBeCloseTo(1, 5);
  });
});

describe('interpolate', () => {
  test('numbers', () => {
    expect(interpolate(0.5, { inputRange: [0, 1], outputRange: [0, 240] })).toBe(120);
  });
  test('several segments', () => {
    const cfg = { inputRange: [0, 1, 2], outputRange: [0, 10, 100] };
    expect(interpolate(1.5, cfg)).toBe(55);
  });
  test('percent strings', () => {
    expect(interpolate(50, { inputRange: [0, 100], outputRange: ['0%', '100%'] })).toBe('50%');
  });
  test('degrees', () => {
    expect(interpolate(0.25, { inputRange: [0, 1], outputRange: ['0deg', '360deg'] })).toBe('90deg');
  });
  test('extrapolation: extend by default, clamp when asked', () => {
    expect(interpolate(2, { inputRange: [0, 1], outputRange: [0, 10] })).toBe(20);
    expect(interpolate(2, { inputRange: [0, 1], outputRange: [0, 10], extrapolate: 'clamp' })).toBe(10);
    expect(interpolate(-1, { inputRange: [0, 1], outputRange: [0, 10], extrapolateLeft: 'clamp' })).toBe(0);
  });
});

describe('values', () => {
  test('setValue notifies listeners and subscribers', () => {
    const v = new AnimatedValue(0);
    const seen: number[] = [];
    v.addListener(({ value }) => seen.push(value));
    let calls = 0;
    v.subscribe(() => calls++);
    v.setValue(3);
    v.setValue(7);
    expect(seen).toEqual([3, 7]);
    expect(calls).toBe(2);
  });
  test('an interpolation follows its parent', () => {
    const v = new AnimatedValue(0);
    const i = v.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
    v.setValue(0.4);
    expect(i.getValue()).toBe(40);
  });
});

describe('resolveAnimated', () => {
  test('swaps animated values inside styles, arrays and transforms for their current value', () => {
    const y = new AnimatedValue(0);
    y.setValue(12);
    const style = [{ opacity: y.interpolate({ inputRange: [0, 24], outputRange: [0, 1] }) }, { transform: [{ translateY: y }] }];
    expect(resolveAnimated(style)).toEqual([{ opacity: 0.5 }, { transform: [{ translateY: 12 }] }]);
  });
  test('leaves plain values, children and class instances alone', () => {
    const date = new Date(0);
    expect(resolveAnimated({ a: 1, b: 'x', d: date })).toEqual({ a: 1, b: 'x', d: date });
  });
});
