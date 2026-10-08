import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_ORDER_STATUS,
  ORDER_EVENTS,
  ORDER_STATES,
  TERMINAL_ORDER_STATES,
  TRANSITIONS,
  applyTransition,
  canTransition,
  isTerminalOrderStatus,
  type OrderStatus,
} from '../src/order-state.js';

describe('ORDER_STATES', () => {
  it('matches the database order_status enum exactly (schema.prisma), so the two cannot silently drift', () => {
    const schemaPath = fileURLToPath(
      new URL('../../../apps/backend/prisma/schema.prisma', import.meta.url),
    );
    const schema = readFileSync(schemaPath, 'utf8');
    const match = /enum OrderStatus \{([^}]*)\}/.exec(schema);
    if (!match) throw new Error('Could not find `enum OrderStatus` in schema.prisma');

    const dbStates = (match[1] as string)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('@@'));

    expect([...ORDER_STATES].sort()).toEqual([...dbStates].sort());
  });

  it('has no duplicate states', () => {
    expect(new Set(ORDER_STATES).size).toBe(ORDER_STATES.length);
  });
});

describe('terminal states (R1)', () => {
  it.each([...TERMINAL_ORDER_STATES])('rejects every event from %s', (state) => {
    for (const event of ORDER_EVENTS) {
      expect(canTransition(state, event)).toBe(false);
      const result = applyTransition(state, event);
      expect(result.ok).toBe(false);
    }
  });

  it('reports terminal vs non-terminal correctly', () => {
    expect(isTerminalOrderStatus('COMPLETED')).toBe(true);
    expect(isTerminalOrderStatus('REFUNDED')).toBe(true);
    expect(isTerminalOrderStatus('CANCELLED')).toBe(true);
    expect(isTerminalOrderStatus('EXPIRED')).toBe(true);
    expect(isTerminalOrderStatus('CONVERSION_FAILED')).toBe(true);
    expect(isTerminalOrderStatus('PREFLIGHT_FAILED')).toBe(true);
    expect(isTerminalOrderStatus('QUOTED')).toBe(false);
    expect(isTerminalOrderStatus('PAID')).toBe(false);
  });

  it('no transition originates from a terminal state', () => {
    for (const t of TRANSITIONS) {
      expect(TERMINAL_ORDER_STATES.has(t.from)).toBe(false);
    }
  });
});

describe('reachability', () => {
  it('every state is either the initial state or reachable as a transition target', () => {
    const reachable = new Set<OrderStatus>(TRANSITIONS.map((t) => t.to));
    reachable.add(INITIAL_ORDER_STATUS);
    for (const state of ORDER_STATES) {
      expect(reachable.has(state)).toBe(true);
    }
  });

  it('DRAFT is the initial state and is not itself a transition target', () => {
    expect(INITIAL_ORDER_STATUS).toBe('DRAFT');
  });
});

describe('canTransition / applyTransition', () => {
  it('allows a known transition and returns the right target', () => {
    expect(canTransition('DRAFT', 'shop_resolved')).toBe(true);
    expect(applyTransition('DRAFT', 'shop_resolved')).toEqual({ ok: true, to: 'AWAITING_FILE' });
  });

  it('rejects an event that does not apply to the current state', () => {
    expect(canTransition('DRAFT', 'payment_captured')).toBe(false);
    const result = applyTransition('DRAFT', 'payment_captured');
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_TRANSITION', from: 'DRAFT', event: 'payment_captured' },
    });
  });

  it('QUOTED options_confirmed is a same-state transition (side effect only, per §17)', () => {
    expect(applyTransition('QUOTED', 'options_confirmed')).toEqual({ ok: true, to: 'QUOTED' });
  });

  it('disambiguates the shared "auto" event by its source state', () => {
    expect(applyTransition('PAID', 'auto')).toEqual({ ok: true, to: 'QUEUED' });
    expect(applyTransition('PRINTED', 'auto')).toEqual({ ok: true, to: 'COMPLETED' });
    expect(applyTransition('PRINT_FAILED', 'auto')).toEqual({ ok: true, to: 'REFUND_PENDING' });
    expect(applyTransition('REJECTED', 'auto')).toEqual({ ok: true, to: 'REFUND_PENDING' });
  });

  it('PAID is a fork point: approval, secure release, or straight to the queue', () => {
    expect(applyTransition('PAID', 'needs_approval')).toEqual({
      ok: true,
      to: 'AWAITING_APPROVAL',
    });
    expect(applyTransition('PAID', 'secure_release_on')).toEqual({ ok: true, to: 'HELD' });
    expect(applyTransition('PAID', 'auto')).toEqual({ ok: true, to: 'QUEUED' });
  });

  it('cancellation is only reachable from the documented pre-payment states', () => {
    const cancellable: OrderStatus[] = ['DRAFT', 'AWAITING_FILE', 'QUOTED', 'AWAITING_PAYMENT'];
    for (const state of cancellable) {
      expect(canTransition(state, 'student_cancelled')).toBe(true);
    }
    for (const state of ORDER_STATES) {
      if (cancellable.includes(state)) continue;
      expect(canTransition(state, 'student_cancelled')).toBe(false);
    }
  });

  it('every transition in the table round-trips through applyTransition', () => {
    for (const t of TRANSITIONS) {
      expect(applyTransition(t.from, t.event)).toEqual({ ok: true, to: t.to });
    }
  });
});
