import { describe, expect, it } from 'vitest';
import { CURRENCY, PAISE_PER_RUPEE, SHARED_PACKAGE_NAME, formatPaise } from '../src/index.js';

describe('@kagaz/shared', () => {
  it('exposes its identity constants', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@kagaz/shared');
    expect(CURRENCY).toBe('INR');
    expect(PAISE_PER_RUPEE).toBe(100);
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
      expect(formatPaise(paise)).toBe(expected);
    });

    it('refuses a float, because a float here means a money bug upstream', () => {
      expect(() => formatPaise(142.5)).toThrow(TypeError);
    });
  });
});
