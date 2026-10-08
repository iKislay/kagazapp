import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ERROR_DEFINITIONS,
  formatStudentMessage,
  getErrorDefinition,
  STUDENT_REPORTED_MISSING_FREE_CAP,
} from '../src/errors.js';
import { ORDER_STATES } from '../src/order-state.js';

describe('ERROR_DEFINITIONS', () => {
  it('every pre-payment error never refunds (no money was taken yet)', () => {
    for (const code of ERROR_CODES) {
      const def = ERROR_DEFINITIONS[code];
      if (def.phase === 'pre_payment') {
        expect(def.refund).toBe(false);
      }
    }
  });

  it('every post-payment error always refunds — R-P1/R-P3, no exceptions', () => {
    for (const code of ERROR_CODES) {
      const def = ERROR_DEFINITIONS[code];
      if (def.phase === 'post_payment') {
        expect(def.refund).toBe(true);
      }
    }
  });

  it('every targetStatus is either "stay" or a real order status', () => {
    for (const code of ERROR_CODES) {
      const { targetStatus } = ERROR_DEFINITIONS[code];
      if (targetStatus !== 'stay') {
        expect(ORDER_STATES).toContain(targetStatus);
      }
    }
  });

  it('has no duplicate codes and the code field matches its own key', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) {
      expect(ERROR_DEFINITIONS[code].code).toBe(code);
    }
  });

  it('getErrorDefinition looks up the same object', () => {
    expect(getErrorDefinition('SHOP_OFFLINE')).toBe(ERROR_DEFINITIONS.SHOP_OFFLINE);
  });

  it('STUDENT_REPORTED_MISSING is the only manual-review path (R-P6)', () => {
    const manual = ERROR_CODES.filter((c) => ERROR_DEFINITIONS[c].requiresManualReview === true);
    expect(manual).toEqual(['STUDENT_REPORTED_MISSING']);
    expect(STUDENT_REPORTED_MISSING_FREE_CAP).toBe(2);
  });

  it('STUCK_ORDER pages an admin', () => {
    expect(ERROR_DEFINITIONS.STUCK_ORDER.adminAlert).toBe(true);
  });
});

describe('formatStudentMessage', () => {
  it('fills a placeholder', () => {
    expect(formatStudentMessage('PAGE_LIMIT_EXCEEDED', { n: 300 })).toBe(
      "That's 300 pages — more than this shop takes online. Please visit the counter.",
    );
  });

  it('passes a message through unchanged when it has no placeholders', () => {
    expect(formatStudentMessage('SHOP_OFFLINE')).toBe('This shop is closed right now.');
  });

  it('leaves an unmatched placeholder as-is rather than throwing', () => {
    expect(formatStudentMessage('PAGE_LIMIT_EXCEEDED')).toBe(
      "That's {n} pages — more than this shop takes online. Please visit the counter.",
    );
  });
});
