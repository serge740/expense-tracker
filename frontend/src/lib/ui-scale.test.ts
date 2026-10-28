import { describe, expect, test } from 'vitest';
import { fontScaleFor } from './ui-scale';

describe('fontScaleFor', () => {
  test('a normal phone and anything wider is left alone', () => {
    expect(fontScaleFor(390)).toBe(1);
    expect(fontScaleFor(430)).toBe(1);
    expect(fontScaleFor(1280)).toBe(1);
  });
  test('narrow screens shrink in proportion', () => {
    expect(fontScaleFor(360)).toBeCloseTo(0.923, 3);
    expect(fontScaleFor(340)).toBeCloseTo(0.872, 3);
  });
  test('never below the floor, and bad widths fall back to 1', () => {
    expect(fontScaleFor(200)).toBe(0.82);
    expect(fontScaleFor(0)).toBe(1);
    expect(fontScaleFor(NaN)).toBe(1);
  });
});
