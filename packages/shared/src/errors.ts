/**
 * The §27 error taxonomy. Every failure in the system has a code, and the
 * code alone determines the student message, whether money moves, and
 * whether an operator is paged. Nothing downstream should decide these
 * things ad hoc — look the code up here.
 */

import type { OrderStatus } from './order-state.js';

export type ErrorPhase = 'pre_payment' | 'post_payment';

export interface ErrorDefinition {
  readonly code: string;
  readonly phase: ErrorPhase;
  readonly cause: string;
  /** May contain `{placeholders}` — see `formatStudentMessage`. */
  readonly studentMessage: string;
  /** R-P2: post-payment refunds are always full, including commission. */
  readonly refund: boolean;
  readonly notifyOperator: boolean;
  /** The order's status after this error. `'stay'` = unchanged. */
  readonly targetStatus: OrderStatus | 'stay';
  readonly requiresManualReview?: boolean;
  readonly adminAlert?: boolean;
}

function definePrePayment(
  def: Omit<ErrorDefinition, 'phase' | 'refund' | 'notifyOperator'> & { notifyOperator?: boolean },
): ErrorDefinition {
  return { phase: 'pre_payment', refund: false, notifyOperator: false, ...def };
}

function definePostPayment(def: Omit<ErrorDefinition, 'phase' | 'refund'>): ErrorDefinition {
  return { phase: 'post_payment', refund: true, ...def };
}

export const ERROR_DEFINITIONS = {
  // ---- Pre-payment — no money involved ----
  SHOP_OFFLINE: definePrePayment({
    code: 'SHOP_OFFLINE',
    cause: 'App not running',
    studentMessage: 'This shop is closed right now.',
    targetStatus: 'CANCELLED',
  }),
  SHOP_SUSPENDED: definePrePayment({
    code: 'SHOP_SUSPENDED',
    cause: 'Admin suspended',
    studentMessage: "This shop isn't accepting Kagaz orders.",
    targetStatus: 'CANCELLED',
  }),
  FILE_TOO_LARGE: definePrePayment({
    code: 'FILE_TOO_LARGE',
    cause: '> 50 MB',
    studentMessage: 'That file is too big. Max 50 MB.',
    targetStatus: 'stay',
  }),
  FILE_TYPE_UNSUPPORTED: definePrePayment({
    code: 'FILE_TYPE_UNSUPPORTED',
    cause: 'Bad MIME',
    studentMessage: 'I can print PDF, Word, PowerPoint, Excel and images.',
    targetStatus: 'stay',
  }),
  CONVERSION_FAILED: definePrePayment({
    code: 'CONVERSION_FAILED',
    cause: 'LibreOffice failed',
    studentMessage: "I couldn't read that file. Can you send it as a PDF?",
    targetStatus: 'CONVERSION_FAILED',
  }),
  CONVERSION_TIMEOUT: definePrePayment({
    code: 'CONVERSION_TIMEOUT',
    cause: '> 60 s',
    studentMessage: "I couldn't read that file. Can you send it as a PDF?",
    targetStatus: 'CONVERSION_FAILED',
  }),
  PAGE_LIMIT_EXCEEDED: definePrePayment({
    code: 'PAGE_LIMIT_EXCEEDED',
    cause: '> shop cap',
    studentMessage:
      "That's {n} pages — more than this shop takes online. Please visit the counter.",
    targetStatus: 'CANCELLED',
  }),
  AMOUNT_LIMIT_EXCEEDED: definePrePayment({
    code: 'AMOUNT_LIMIT_EXCEEDED',
    cause: '> shop cap',
    studentMessage: 'That order is larger than this shop takes online. Please visit the counter.',
    targetStatus: 'CANCELLED',
  }),
  INVALID_PAGE_RANGE: definePrePayment({
    code: 'INVALID_PAGE_RANGE',
    cause: 'Parser rejected',
    studentMessage: "I couldn't read that page range. Try something like 1-5,8.",
    targetStatus: 'stay',
  }),
  PRINTER_NO_PAPER: definePrePayment({
    code: 'PRINTER_NO_PAPER',
    cause: 'Preflight',
    studentMessage: 'The printer is out of paper. Try again in a few minutes.',
    targetStatus: 'PREFLIGHT_FAILED',
  }),
  PRINTER_NO_TONER: definePrePayment({
    code: 'PRINTER_NO_TONER',
    cause: 'Preflight',
    studentMessage: 'The printer is out of toner.',
    targetStatus: 'PREFLIGHT_FAILED',
  }),
  PRINTER_JAMMED: definePrePayment({
    code: 'PRINTER_JAMMED',
    cause: 'Preflight',
    studentMessage: 'The printer is jammed.',
    targetStatus: 'PREFLIGHT_FAILED',
  }),
  PRINTER_OFFLINE: definePrePayment({
    code: 'PRINTER_OFFLINE',
    cause: 'Preflight',
    studentMessage: "The printer isn't responding.",
    targetStatus: 'PREFLIGHT_FAILED',
  }),
  NO_COLOR_PRINTER: definePrePayment({
    code: 'NO_COLOR_PRINTER',
    cause: 'Preflight',
    studentMessage: "This shop can't do colour right now. Black & white is available.",
    targetStatus: 'PREFLIGHT_FAILED',
  }),
  QUEUE_FULL: definePrePayment({
    code: 'QUEUE_FULL',
    cause: 'Depth > cap',
    studentMessage: 'There are a lot of jobs ahead of you. Try again shortly.',
    targetStatus: 'PREFLIGHT_FAILED',
  }),
  QUOTE_EXPIRED: definePrePayment({
    code: 'QUOTE_EXPIRED',
    cause: '15 min',
    studentMessage: 'That quote expired. Send the file again?',
    targetStatus: 'EXPIRED',
  }),
  PAYMENT_LINK_EXPIRED: definePrePayment({
    code: 'PAYMENT_LINK_EXPIRED',
    cause: '15 min',
    studentMessage: 'Payment link expired. Nothing was charged.',
    targetStatus: 'EXPIRED',
  }),
  PAYMENT_FAILED: definePrePayment({
    code: 'PAYMENT_FAILED',
    cause: 'Gateway',
    studentMessage: "Payment didn't go through. Here's a fresh link.",
    targetStatus: 'PAYMENT_FAILED',
  }),

  // ---- Post-payment — all auto-refund, no exceptions (R-P1..R-P3) ----
  DISPATCH_TIMEOUT: definePostPayment({
    code: 'DISPATCH_TIMEOUT',
    cause: "Device didn't ack in 60 s",
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  DEVICE_REJECTED_JOB: definePostPayment({
    code: 'DEVICE_REJECTED_JOB',
    cause: 'Device said no',
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  DOWNLOAD_FAILED: definePostPayment({
    code: 'DOWNLOAD_FAILED',
    cause: "Device couldn't fetch the PDF",
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  CHECKSUM_MISMATCH: definePostPayment({
    code: 'CHECKSUM_MISMATCH',
    cause: 'SHA-256 mismatch',
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  SPOOL_FAILED: definePostPayment({
    code: 'SPOOL_FAILED',
    cause: 'SumatraPDF non-zero exit',
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  PRINT_INCOMPLETE: definePostPayment({
    code: 'PRINT_INCOMPLETE',
    cause: 'Page counter delta short',
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  PRINT_TIMEOUT: definePostPayment({
    code: 'PRINT_TIMEOUT',
    cause: 'No confirmation in 120 s',
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  PRINTER_ERROR_MIDJOB: definePostPayment({
    code: 'PRINTER_ERROR_MIDJOB',
    cause: 'Jam/paper out during the job',
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  SHOP_WENT_OFFLINE: definePostPayment({
    code: 'SHOP_WENT_OFFLINE',
    cause: 'Socket died between PAID and PRINTED',
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'PRINT_FAILED',
  }),
  OPERATOR_REJECTED: definePostPayment({
    code: 'OPERATOR_REJECTED',
    cause: 'Operator declined an approval',
    studentMessage: "The shop couldn't take this order. We're refunding you in full.",
    notifyOperator: false,
    targetStatus: 'REJECTED',
  }),
  HOLD_EXPIRED: definePostPayment({
    code: 'HOLD_EXPIRED',
    cause: 'Secure release not tapped in 6 h',
    studentMessage: "You didn't collect this in time, so we're refunding you in full.",
    notifyOperator: false,
    targetStatus: 'REFUND_PENDING',
  }),
  STUDENT_REPORTED_MISSING: definePostPayment({
    code: 'STUDENT_REPORTED_MISSING',
    cause: "Student said it didn't print",
    studentMessage: "We're looking into it and will refund you in full.",
    notifyOperator: true,
    targetStatus: 'REFUND_PENDING',
    requiresManualReview: true,
  }),
  STUCK_ORDER: definePostPayment({
    code: 'STUCK_ORDER',
    cause: 'Sweeper found it stalled > 2 h',
    studentMessage: "Something went wrong on our end. We're refunding you in full.",
    notifyOperator: true,
    targetStatus: 'REFUND_PENDING',
    adminAlert: true,
  }),
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

export const ERROR_CODES = Object.keys(ERROR_DEFINITIONS) as ErrorCode[];

export function getErrorDefinition(code: ErrorCode): ErrorDefinition {
  return ERROR_DEFINITIONS[code];
}

/**
 * Fills `{placeholders}` in a student message, e.g.
 * `formatStudentMessage('PAGE_LIMIT_EXCEEDED', { n: 300 })`.
 * Any placeholder left unmatched is passed through unchanged rather than
 * throwing — a missing var should not be the reason a student never hears
 * back.
 */
export function formatStudentMessage(
  code: ErrorCode,
  vars?: Record<string, string | number>,
): string {
  const template = ERROR_DEFINITIONS[code].studentMessage;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}

/** R-P6: the only manual refund path, capped per student to discourage abuse. */
export const STUDENT_REPORTED_MISSING_FREE_CAP = 2;
export const STUDENT_REPORTED_MISSING_CAP_WINDOW_DAYS = 30;
