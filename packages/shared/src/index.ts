/**
 * @kagaz/shared — types and pure logic shared by the backend and the desktop app.
 *
 * Everything in here must stay pure: no database, no network, no filesystem,
 * no `process.env`. That is what makes it testable in milliseconds and safe to
 * run inside the Electron main process.
 *
 * Phase 2 fills this package out (money, pricing, page-range, order-state,
 * ws-protocol, errors). Phase 0 only proves that workspace resolution works.
 */

export const SHARED_PACKAGE_NAME = '@kagaz/shared' as const;

/** Currency is fixed for v1. All money in this codebase is integer paise. */
export const CURRENCY = 'INR' as const;

/** 100 paise in a rupee. Never use a float to represent money. */
export const PAISE_PER_RUPEE = 100 as const;

/**
 * Formats integer paise for display, e.g. 14250 -> "₹142.50".
 * Display only — never parse this back into an amount.
 */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new TypeError(`formatPaise expects integer paise, got ${paise}`);
  }
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / PAISE_PER_RUPEE);
  const remainder = abs % PAISE_PER_RUPEE;
  return `${sign}₹${rupees}.${String(remainder).padStart(2, '0')}`;
}
