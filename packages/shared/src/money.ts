/**
 * All money in this codebase is integer paise (1 rupee = 100 paise), per §18.
 * `Paise` is branded so a raw `number` — almost always a rupee value from
 * somewhere — cannot be passed where paise is expected without going through
 * `asPaise`/`rupeesToPaise` first.
 */

declare const PAISE_BRAND: unique symbol;
export type Paise = number & { readonly [PAISE_BRAND]: true };

/** Currency is fixed for v1. */
export const CURRENCY = 'INR' as const;

/** 100 paise in a rupee. Never use a float to represent money. */
export const PAISE_PER_RUPEE = 100 as const;

export const ZERO_PAISE = 0 as Paise;

/** Basis points: 1 bps = 0.01%. 10,000 bps = 100%. */
export type Bps = number;

/**
 * Asserts `value` is a valid paise amount and brands it. The only sanctioned
 * way to produce a `Paise` from an arbitrary number.
 */
export function asPaise(value: number): Paise {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Paise must be an integer, got ${value}`);
  }
  return value as Paise;
}

/**
 * Converts a rupee amount (e.g. from an admin form) to paise. Rounds to the
 * nearest paise to absorb float noise from the `* 100` multiplication —
 * this is the one place that's the right call; totals themselves must
 * never be rounded (see §20).
 */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) {
    throw new TypeError(`rupeesToPaise expects a finite number, got ${rupees}`);
  }
  return asPaise(Math.round(rupees * PAISE_PER_RUPEE));
}

/**
 * Formats integer paise for display, e.g. 14250 -> "₹142.50".
 * Display only — never parse this back into an amount.
 */
export function formatPaise(paise: Paise): string {
  if (!Number.isInteger(paise)) {
    throw new TypeError(`formatPaise expects integer paise, got ${paise}`);
  }
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / PAISE_PER_RUPEE);
  const remainder = abs % PAISE_PER_RUPEE;
  return `${sign}₹${rupees}.${String(remainder).padStart(2, '0')}`;
}

export function addPaise(a: Paise, b: Paise): Paise {
  return asPaise(a + b);
}

export function subtractPaise(a: Paise, b: Paise): Paise {
  return asPaise(a - b);
}

export function maxPaise(a: Paise, b: Paise): Paise {
  return a >= b ? a : b;
}

export function minPaise(a: Paise, b: Paise): Paise {
  return a <= b ? a : b;
}

/**
 * `amount * bps / 10000`, floored. Used for discounts and commission alike —
 * §20 specifies floor for both, because both favour the shop over the
 * platform when a fraction of a paise is in play.
 */
export function applyBpsFloor(amount: Paise, bps: Bps): Paise {
  return asPaise(Math.floor((amount * bps) / 10_000));
}
