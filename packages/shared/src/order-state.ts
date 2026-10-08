/**
 * The §17 order state machine, as data. Any (state, event) pair not in
 * `TRANSITIONS` is invalid — `applyTransition` reports it as a typed error
 * rather than mutating anything, and the caller decides what to do.
 *
 * `DRAFT` is the one state not reached via a transition: it is the row's
 * default at INSERT time (see `schema.prisma`), created in response to
 * `student_greeting` before an `orders` row exists. Everything after that
 * goes through this table.
 */

export const ORDER_STATES = [
  'DRAFT',
  'AWAITING_FILE',
  'CONVERTING',
  'CONVERSION_FAILED',
  'QUOTED',
  'PREFLIGHT_FAILED',
  'AWAITING_PAYMENT',
  'PAYMENT_FAILED',
  'EXPIRED',
  'PAID',
  'AWAITING_APPROVAL',
  'REJECTED',
  'HELD',
  'QUEUED',
  'DISPATCHED',
  'PRINTING',
  'PRINTED',
  'COMPLETED',
  'PRINT_FAILED',
  'REFUND_PENDING',
  'REFUNDED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATES)[number];

/** The state an order is created in. Not reachable via `applyTransition`. */
export const INITIAL_ORDER_STATUS: OrderStatus = 'DRAFT';

/** R1: a transition out of any of these is always an error. */
export const TERMINAL_ORDER_STATES: ReadonlySet<OrderStatus> = new Set([
  'COMPLETED',
  'REFUNDED',
  'CANCELLED',
  'EXPIRED',
  'CONVERSION_FAILED',
  'PREFLIGHT_FAILED',
]);

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATES.has(status);
}

export const ORDER_EVENTS = [
  'shop_resolved',
  'file_received',
  'conversion_ok',
  'conversion_failed',
  'options_changed',
  'options_confirmed',
  'preflight_ok',
  'preflight_failed',
  'quote_expired',
  'payment_captured',
  'payment_failed',
  'retry',
  'link_expired',
  'needs_approval',
  'secure_release_on',
  'auto',
  'operator_approved',
  'operator_rejected',
  'student_released',
  'hold_expired',
  'dispatched',
  'device_ack',
  'dispatch_timeout',
  'print_verified',
  'print_error',
  'refund_processed',
  'student_cancelled',
] as const;

export type OrderEvent = (typeof ORDER_EVENTS)[number];

interface Transition {
  readonly from: OrderStatus;
  readonly event: OrderEvent;
  readonly to: OrderStatus;
}

/**
 * The authoritative transition table from §17. Order mirrors the spec's
 * table for easy comparison; `options_confirmed` maps `QUOTED` to itself
 * because no persisted status changes — it only fires the
 * `PREFLIGHT_REQUEST` side effect, and `preflight_ok`/`preflight_failed`
 * (also from `QUOTED`) carry the real outcome once the device replies.
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: 'DRAFT', event: 'shop_resolved', to: 'AWAITING_FILE' },
  { from: 'AWAITING_FILE', event: 'file_received', to: 'CONVERTING' },
  { from: 'CONVERTING', event: 'conversion_ok', to: 'QUOTED' },
  { from: 'CONVERTING', event: 'conversion_failed', to: 'CONVERSION_FAILED' },
  { from: 'QUOTED', event: 'options_changed', to: 'QUOTED' },
  { from: 'QUOTED', event: 'options_confirmed', to: 'QUOTED' },
  { from: 'QUOTED', event: 'preflight_ok', to: 'AWAITING_PAYMENT' },
  { from: 'QUOTED', event: 'preflight_failed', to: 'PREFLIGHT_FAILED' },
  { from: 'QUOTED', event: 'quote_expired', to: 'EXPIRED' },
  { from: 'AWAITING_PAYMENT', event: 'payment_captured', to: 'PAID' },
  { from: 'AWAITING_PAYMENT', event: 'payment_failed', to: 'PAYMENT_FAILED' },
  { from: 'PAYMENT_FAILED', event: 'retry', to: 'AWAITING_PAYMENT' },
  { from: 'AWAITING_PAYMENT', event: 'link_expired', to: 'EXPIRED' },
  { from: 'PAID', event: 'needs_approval', to: 'AWAITING_APPROVAL' },
  { from: 'PAID', event: 'secure_release_on', to: 'HELD' },
  { from: 'PAID', event: 'auto', to: 'QUEUED' },
  { from: 'AWAITING_APPROVAL', event: 'operator_approved', to: 'QUEUED' },
  { from: 'AWAITING_APPROVAL', event: 'operator_rejected', to: 'REJECTED' },
  { from: 'HELD', event: 'student_released', to: 'QUEUED' },
  { from: 'HELD', event: 'hold_expired', to: 'REFUND_PENDING' },
  { from: 'QUEUED', event: 'dispatched', to: 'DISPATCHED' },
  { from: 'DISPATCHED', event: 'device_ack', to: 'PRINTING' },
  { from: 'DISPATCHED', event: 'dispatch_timeout', to: 'PRINT_FAILED' },
  { from: 'PRINTING', event: 'print_verified', to: 'PRINTED' },
  { from: 'PRINTING', event: 'print_error', to: 'PRINT_FAILED' },
  { from: 'PRINTED', event: 'auto', to: 'COMPLETED' },
  { from: 'PRINT_FAILED', event: 'auto', to: 'REFUND_PENDING' },
  { from: 'REJECTED', event: 'auto', to: 'REFUND_PENDING' },
  { from: 'REFUND_PENDING', event: 'refund_processed', to: 'REFUNDED' },
  { from: 'DRAFT', event: 'student_cancelled', to: 'CANCELLED' },
  { from: 'AWAITING_FILE', event: 'student_cancelled', to: 'CANCELLED' },
  { from: 'QUOTED', event: 'student_cancelled', to: 'CANCELLED' },
  { from: 'AWAITING_PAYMENT', event: 'student_cancelled', to: 'CANCELLED' },
];

function transitionKey(from: OrderStatus, event: OrderEvent): string {
  return `${from}::${event}`;
}

const TRANSITION_MAP: ReadonlyMap<string, OrderStatus> = new Map(
  TRANSITIONS.map((t) => [transitionKey(t.from, t.event), t.to]),
);

export function canTransition(from: OrderStatus, event: OrderEvent): boolean {
  return TRANSITION_MAP.has(transitionKey(from, event));
}

export interface InvalidTransitionError {
  readonly code: 'INVALID_TRANSITION';
  readonly from: OrderStatus;
  readonly event: OrderEvent;
}

export type TransitionResult =
  { ok: true; to: OrderStatus } | { ok: false; error: InvalidTransitionError };

/**
 * The only place that decides what state an order moves to next. Never
 * throws — R1 (terminal states reject everything) and every other invalid
 * pair simply come back as `{ ok: false }` for the caller to handle.
 */
export function applyTransition(from: OrderStatus, event: OrderEvent): TransitionResult {
  const to = TRANSITION_MAP.get(transitionKey(from, event));
  if (to === undefined) {
    return { ok: false, error: { code: 'INVALID_TRANSITION', from, event } };
  }
  return { ok: true, to };
}
