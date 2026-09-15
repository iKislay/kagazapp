/**
 * Phase 1 acceptance: "Inserting two ledger entries summing to 100 paise raises
 * an exception naming the transaction."
 *
 * This is the load-bearing test of the whole money design. The trigger is
 * DEFERRABLE INITIALLY DEFERRED, which means it fires at COMMIT, not at INSERT
 * — so a test that only inserts and never commits would pass while proving
 * nothing. Every case here therefore runs inside an explicit transaction and
 * asserts on what happens when that transaction tries to commit.
 *
 * Needs a migrated database. Skipped, loudly, when DATABASE_URL is absent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { newId } from '../src/lib/id.js';

// test/setup.ts flags the placeholder it supplies, so "has a URL" and
// "has a database" stay different questions.
const hasDatabase = !process.env['KAGAZ_NO_DATABASE'];
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('\n  [skipped] ledger-trigger tests: no DATABASE_URL — see prisma/README.md\n');
}

// Imported lazily so that a checkout without a generated client (or without a
// database) skips these tests rather than failing to load the file at all.
let prisma: PrismaClient;

beforeAll(async () => {
  const { PrismaClient: Client } = await import('@prisma/client');
  prisma = new Client();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

/** A shop to hang wallet entries off. Created and removed per test. */
async function createShop(): Promise<string> {
  const id = newId();
  await prisma.shop.create({
    data: {
      id,
      code: `T${id.slice(0, 7).toUpperCase()}`,
      name: 'Ledger test shop',
      ownerName: 'Test',
      ownerPhone: '+910000000000',
    },
  });
  return id;
}

describeDb('ledger balance trigger', () => {
  it('rejects a transaction whose entries do not sum to zero, naming it', async () => {
    const shopId = await createShop();
    const transactionId = newId();

    const attempt = prisma.$transaction(async (tx) => {
      await tx.ledgerTransaction.create({
        data: {
          id: transactionId,
          kind: 'adjustment',
          shopId,
          description: 'deliberately unbalanced',
          createdBy: 'test',
        },
      });

      // -3600 and +3700 — off by exactly 100 paise.
      await tx.ledgerEntry.createMany({
        data: [
          { transactionId, accountKind: 'student_inflow', amountPaise: BigInt(-3600) },
          {
            transactionId,
            accountKind: 'shop_wallet',
            accountRef: shopId,
            amountPaise: BigInt(3700),
          },
        ],
      });
    });

    await expect(attempt).rejects.toThrow(/does not balance/i);
    // The message must carry the transaction id — the whole point is that an
    // on-call engineer can find the offending transaction from the log line.
    await expect(attempt).rejects.toThrow(new RegExp(transactionId, 'i'));

    // And nothing may have been written.
    const survivors = await prisma.ledgerEntry.count({ where: { transactionId } });
    expect(survivors).toBe(0);

    await prisma.shop.delete({ where: { id: shopId } });
  });

  it('accepts a balanced three-entry transaction (the §18 ₹36 order)', async () => {
    const shopId = await createShop();
    const transactionId = newId();

    await prisma.$transaction(async (tx) => {
      await tx.ledgerTransaction.create({
        data: {
          id: transactionId,
          kind: 'order_payment',
          shopId,
          description: '₹36 order',
          createdBy: 'test',
        },
      });
      await tx.ledgerEntry.createMany({
        data: [
          { transactionId, accountKind: 'student_inflow', amountPaise: BigInt(-3600) },
          {
            transactionId,
            accountKind: 'shop_wallet',
            accountRef: shopId,
            amountPaise: BigInt(3420),
          },
          { transactionId, accountKind: 'kagaz_revenue', amountPaise: BigInt(180) },
        ],
      });
    });

    const entries = await prisma.ledgerEntry.findMany({ where: { transactionId } });
    expect(entries).toHaveLength(3);
    expect(entries.reduce((sum, e) => sum + e.amountPaise, 0n)).toBe(0n);

    // The wallet view must agree.
    const [row] = await prisma.$queryRaw<{ balance_paise: bigint }[]>`
      SELECT balance_paise FROM shop_wallet_balances WHERE shop_id = ${shopId}::uuid
    `;
    expect(row?.balance_paise).toBe(3420n);

    await prisma.ledgerEntry.deleteMany({ where: { transactionId } });
    await prisma.ledgerTransaction.delete({ where: { id: transactionId } });
    await prisma.shop.delete({ where: { id: shopId } });
  });

  it('rejects a lone entry — a single-sided posting is never valid', async () => {
    const shopId = await createShop();
    const transactionId = newId();

    const attempt = prisma.$transaction(async (tx) => {
      await tx.ledgerTransaction.create({
        data: {
          id: transactionId,
          kind: 'adjustment',
          shopId,
          description: 'one-sided',
          createdBy: 'test',
        },
      });
      await tx.ledgerEntry.create({
        data: {
          transactionId,
          accountKind: 'shop_wallet',
          accountRef: shopId,
          amountPaise: BigInt(500),
        },
      });
    });

    await expect(attempt).rejects.toThrow(/does not balance/i);

    await prisma.shop.delete({ where: { id: shopId } });
  });

  it('allows entries to be inserted in any order within the transaction', async () => {
    // This is what DEFERRABLE buys us: the credit may land before the debit.
    const shopId = await createShop();
    const transactionId = newId();

    await prisma.$transaction(async (tx) => {
      await tx.ledgerTransaction.create({
        data: {
          id: transactionId,
          kind: 'order_payment',
          shopId,
          description: 'credit first',
          createdBy: 'test',
        },
      });
      await tx.ledgerEntry.create({
        data: {
          transactionId,
          accountKind: 'shop_wallet',
          accountRef: shopId,
          amountPaise: BigInt(1000),
        },
      });
      await tx.ledgerEntry.create({
        data: { transactionId, accountKind: 'student_inflow', amountPaise: BigInt(-1000) },
      });
    });

    const entries = await prisma.ledgerEntry.findMany({ where: { transactionId } });
    expect(entries).toHaveLength(2);

    await prisma.ledgerEntry.deleteMany({ where: { transactionId } });
    await prisma.ledgerTransaction.delete({ where: { id: transactionId } });
    await prisma.shop.delete({ where: { id: shopId } });
  });
});
