import { describe, expect, it } from 'vitest';
import {
  CURRENCY,
  PAISE_PER_RUPEE,
  addPaise,
  applyBpsFloor,
  asPaise,
  formatPaise,
  maxPaise,
  minPaise,
  rupeesToPaise,
  subtractPaise,
  type Paise,
} from '../src/money.js';

describe('money constants', () => {
  it('fixes currency and denomination', () => {
    expect(CURRENCY).toBe('INR');
    expect(PAISE_PER_RUPEE).toBe(100);
  });
});

describe('asPaise', () => {
  it('brands an integer', () => {
    expect(asPaise(150)).toBe(150);
  });

  it('rejects a non-integer, because a float here means a bug upstream', () => {
    expect(() => asPaise(142.5)).toThrow(TypeError);
  });

  it('accepts zero and negative integers (reversals are valid paise amounts)', () => {
    expect(asPaise(0)).toBe(0);
    expect(asPaise(-500)).toBe(-500);
  });
});

describe('rupeesToPaise', () => {
  it.each([
    [0, 0],
    [1, 100],
    [1.5, 150],
    [142.5, 14250],
    [0.01, 1],
  ])('converts ₹%s to %i paise', (rupees, expected) => {
    expect(rupeesToPaise(rupees)).toBe(expected);
  });

  it('rounds away float noise from the multiplication', () => {
    // 1.1 * 100 === 110.00000000000001 in IEEE754.
    expect(rupeesToPaise(1.1)).toBe(110);
  });

  it('rejects a non-finite input', () => {
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => rupeesToPaise(Number.NaN)).toThrow(TypeError);
  });
});

describe('formatPaise', () => {
  it.each([
    [0, '₹0.00'],
    [5, '₹0.05'],
    [150, '₹1.50'],
    [1800, '₹18.00'],
    [14250, '₹142.50'],
    [-14250, '-₹142.50'],
  ])('formats %i as %s', (paise, expected) => {
    expect(formatPaise(asPaise(paise))).toBe(expected);
  });

  it('refuses a float, because a float here means a money bug upstream', () => {
    // A branded Paise is guaranteed integer by construction; this exercises
    // the runtime guard for a value that reached here by an unsafe cast.
    expect(() => formatPaise(142.5 as unknown as Paise)).toThrow(TypeError);
  });
});

describe('arithmetic helpers', () => {
  it('add and subtract', () => {
    expect(addPaise(asPaise(100), asPaise(50))).toBe(150);
    expect(subtractPaise(asPaise(100), asPaise(150))).toBe(-50);
  });

  it('max and min', () => {
    expect(maxPaise(asPaise(100), asPaise(500))).toBe(500);
    expect(minPaise(asPaise(100), asPaise(500))).toBe(100);
    expect(maxPaise(asPaise(500), asPaise(500))).toBe(500);
  });
});

describe('applyBpsFloor', () => {
  it.each([
    [15000, 500, 750], // 5% of ₹150.00
    [15000, 1000, 1500], // 10%
    [100, 500, 5], // 5% of ₹1.00
    [1, 9999, 0], // floors toward the shop, not the student
    [0, 500, 0],
    [15000, 0, 0],
  ])('floor(%i * %i / 10000) = %i', (amount, bps, expected) => {
    expect(applyBpsFloor(asPaise(amount), bps)).toBe(expected);
  });
});
