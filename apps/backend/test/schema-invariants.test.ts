/**
 * Phase 1 acceptance: "Every foreign key has an index. Check with a query, do
 * not assume." Plus the structural pieces Prisma does not generate, which are
 * exactly the ones a future `prisma migrate dev` could quietly drop.
 *
 * Needs a migrated database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// test/setup.ts flags the placeholder it supplies, so "has a URL" and
// "has a database" stay different questions.
const hasDatabase = !process.env['KAGAZ_NO_DATABASE'];
const describeDb = hasDatabase ? describe : describe.skip;

// Lazy, for the same reason as in ledger-trigger.test.ts.
let prisma: PrismaClient;

beforeAll(async () => {
  const { PrismaClient: Client } = await import('@prisma/client');
  prisma = new Client();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describeDb('schema invariants', () => {
  it('has an index whose leading column covers every foreign key', async () => {
    // An index on (shop_id, created_at) serves a shop_id lookup; an index on
    // (created_at, shop_id) does not. So the check is on the LEADING column,
    // not on mere membership — that distinction is the difference between a
    // seek and a sequential scan.
    const unindexed = await prisma.$queryRaw<
      { table_name: string; constraint_name: string; column_name: string }[]
    >`
      SELECT
        cl.relname       AS table_name,
        con.conname      AS constraint_name,
        att.attname      AS column_name
      FROM pg_constraint con
      JOIN pg_class cl       ON cl.oid = con.conrelid
      JOIN pg_namespace ns   ON ns.oid = cl.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute att  ON att.attrelid = cl.oid AND att.attnum = k.attnum
      WHERE con.contype = 'f'
        AND ns.nspname = current_schema()
        AND k.ord = 1
        AND NOT EXISTS (
          SELECT 1
          FROM pg_index idx
          WHERE idx.indrelid = cl.oid
            AND idx.indkey[0] = k.attnum
        )
      ORDER BY 1, 2
    `;

    expect(unindexed).toEqual([]);
  });

  it('keeps the ledger balance trigger installed', async () => {
    const [row] = await prisma.$queryRaw<{ tgname: string; tgdeferrable: boolean }[]>`
      SELECT tgname, tgdeferrable
      FROM pg_trigger
      WHERE tgname = 'ledger_balance_check' AND NOT tgisinternal
    `;

    expect(row?.tgname).toBe('ledger_balance_check');
    // If this ever becomes non-deferrable, ordinary two-step postings break.
    expect(row?.tgdeferrable).toBe(true);
  });

  it('keeps the shop_wallet_balances view', async () => {
    const [row] = await prisma.$queryRaw<{ viewname: string }[]>`
      SELECT viewname FROM pg_views
      WHERE schemaname = current_schema() AND viewname = 'shop_wallet_balances'
    `;
    expect(row?.viewname).toBe('shop_wallet_balances');
  });

  it('keeps the three partial indexes', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'files_delete_after_pending_idx',
          'orders_status_live_idx',
          'job_queue_run_after_pending_idx'
        )
      ORDER BY indexname
    `;

    expect(rows.map((r) => r.indexname)).toEqual([
      'files_delete_after_pending_idx',
      'job_queue_run_after_pending_idx',
      'orders_status_live_idx',
    ]);
  });

  it('stores every money column as an integer type, never a float', async () => {
    // A `double precision` anywhere in this list would be a silent, compounding
    // rounding bug across every order the shop ever takes.
    const rows = await prisma.$queryRaw<
      { table_name: string; column_name: string; data_type: string }[]
    >`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (column_name LIKE '%_paise' OR column_name LIKE '%paise%')
      ORDER BY table_name, column_name
    `;

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        ['integer', 'bigint', 'smallint'],
        `${row.table_name}.${row.column_name} is ${row.data_type}`,
      ).toContain(row.data_type);
    }
  });

  it('names the database enums exactly as §16 does', async () => {
    const rows = await prisma.$queryRaw<{ typname: string }[]>`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typtype = 'e' AND n.nspname = current_schema()
      ORDER BY t.typname
    `;

    expect(rows.map((r) => r.typname)).toEqual([
      'account_kind',
      'file_status',
      'order_status',
      'shop_status',
    ]);
  });
});
