/**
 * Seed data for local development.
 *
 * The goal is not "some rows" — it is a database that looks like a shop that
 * has been running for a couple of days, so that every screen has something
 * real to render and every query has something to get wrong. That means orders
 * spread across the lifecycle (§17) and ledger entries that actually balance
 * (§18), because a seed with a lopsided ledger would be rejected by the
 * database trigger anyway, which is a useful thing to find out here.
 *
 *   pnpm db:seed      # seed an already-migrated database
 *   pnpm db:reset     # drop, migrate, seed
 */
import { Prisma, PrismaClient, type OrderStatus } from '@prisma/client';
import { newId, newShortCode } from '../src/lib/id.js';

const prisma = new PrismaClient();

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const now = Date.now();
const ago = (ms: number): Date => new Date(now - ms);

/** Commission per §20 step 8, in paise. */
function commissionFor(totalPaise: number, bps: number, minPaise: number): number {
  return Math.max(Math.floor((totalPaise * bps) / 10_000), minPaise);
}

// ------------------------------------------------------------
// The one shop
// ------------------------------------------------------------

const SHOP_ID = newId();
const RATE_CARD_ID = newId();
const DEVICE_ID = newId();
const PRINTER_BW_ID = newId();
const PRINTER_COLOR_ID = newId();

const COMMISSION_BPS = 500;
const COMMISSION_MIN_PAISE = 100;

/** §20 rate card shape. Prices are what a PESCE-gate shop actually charges. */
const RATE_CARD: Prisma.InputJsonValue = {
  version: 1,
  currency: 'INR',
  min_order_paise: 500,
  print: {
    A4: {
      bw: { single: 150, double: 250 },
      color: { single: 800, double: 1400 },
    },
    A3: {
      bw: { single: 400, double: 700 },
      color: { single: 2000, double: 3500 },
    },
  },
  volume_discounts: [
    { min_sheets: 50, discount_bps: 500 },
    { min_sheets: 200, discount_bps: 1000 },
  ],
  addons: [],
};

// ------------------------------------------------------------
// The students
// ------------------------------------------------------------

const STUDENTS = [
  { id: newId(), phoneE164: '+919900000001', displayName: 'Anil' },
  { id: newId(), phoneE164: '+919900000002', displayName: 'Bhavana' },
  { id: newId(), phoneE164: '+919900000003', displayName: 'Chetan' },
] as const;

// ------------------------------------------------------------
// The ten orders
//
// One per interesting state. `paid` marks the ones that moved money, which is
// what decides whether they get ledger entries.
// ------------------------------------------------------------

interface SeedOrder {
  readonly status: OrderStatus;
  readonly studentIndex: 0 | 1 | 2;
  readonly colorMode: 'bw' | 'color';
  readonly sides: 'single' | 'double';
  readonly copies: number;
  readonly pageCount: number;
  readonly pageRange?: string;
  readonly pagesToPrint: number;
  readonly sheetsToPrint: number;
  readonly totalPaise: number;
  readonly paid: boolean;
  readonly refunded?: boolean;
  readonly failureCode?: string;
  readonly failureDetail?: string;
  readonly createdAgoMs: number;
  readonly fileName: string;
}

const ORDERS: readonly SeedOrder[] = [
  // --- live, no money yet ---
  {
    status: 'QUOTED',
    studentIndex: 0,
    colorMode: 'bw',
    sides: 'double',
    copies: 1,
    pageCount: 12,
    pagesToPrint: 12,
    sheetsToPrint: 6,
    totalPaise: 1500, // §20 worked example row 2
    paid: false,
    createdAgoMs: 4 * MINUTE,
    fileName: 'unit-3-notes.pdf',
  },
  {
    status: 'AWAITING_PAYMENT',
    studentIndex: 1,
    colorMode: 'bw',
    sides: 'single',
    copies: 1,
    pageCount: 12,
    pagesToPrint: 12,
    sheetsToPrint: 12,
    totalPaise: 1800, // §20 worked example row 1
    paid: false,
    createdAgoMs: 11 * MINUTE,
    fileName: 'assignment-2.docx',
  },
  {
    status: 'CONVERSION_FAILED',
    studentIndex: 2,
    colorMode: 'bw',
    sides: 'single',
    copies: 1,
    pageCount: 0,
    pagesToPrint: 0,
    sheetsToPrint: 0,
    totalPaise: 0,
    paid: false,
    failureCode: 'E_CONVERSION_FAILED',
    failureDetail: 'LibreOffice exited 77 — password-protected document',
    createdAgoMs: 3 * HOUR,
    fileName: 'locked-report.docx',
  },
  {
    status: 'PREFLIGHT_FAILED',
    studentIndex: 0,
    colorMode: 'color',
    sides: 'single',
    copies: 1,
    pageCount: 4,
    pagesToPrint: 4,
    sheetsToPrint: 4,
    totalPaise: 3200, // §20 worked example row 6
    paid: false,
    failureCode: 'E_NO_COLOUR_PRINTER',
    failureDetail: 'Colour printer is offline',
    createdAgoMs: 5 * HOUR,
    fileName: 'poster-draft.pdf',
  },
  {
    status: 'EXPIRED',
    studentIndex: 1,
    colorMode: 'bw',
    sides: 'single',
    copies: 2,
    pageCount: 3,
    pagesToPrint: 3,
    sheetsToPrint: 6,
    totalPaise: 900,
    paid: false,
    createdAgoMs: 26 * HOUR,
    fileName: 'lab-observation.pdf',
  },

  // --- paid, in flight ---
  {
    status: 'QUEUED',
    studentIndex: 2,
    colorMode: 'bw',
    sides: 'double',
    copies: 3,
    pageCount: 12,
    pagesToPrint: 12,
    sheetsToPrint: 18,
    totalPaise: 4500, // §20 worked example row 3
    paid: true,
    createdAgoMs: 2 * MINUTE,
    fileName: 'seminar-handout.pdf',
  },
  {
    status: 'PRINTING',
    studentIndex: 0,
    colorMode: 'bw',
    sides: 'double',
    copies: 1,
    pageCount: 60,
    pagesToPrint: 60,
    sheetsToPrint: 30,
    totalPaise: 7500, // §20 worked example row 4
    paid: true,
    createdAgoMs: 6 * MINUTE,
    fileName: 'module-4-full.pdf',
  },
  {
    status: 'AWAITING_APPROVAL',
    studentIndex: 1,
    colorMode: 'bw',
    sides: 'double',
    copies: 1,
    pageCount: 120,
    pagesToPrint: 120,
    sheetsToPrint: 60,
    totalPaise: 14250, // §20 worked example row 5 — the volume-discount case
    paid: true,
    createdAgoMs: 20 * MINUTE,
    fileName: 'project-report-final.pdf',
  },

  // --- terminal ---
  {
    status: 'COMPLETED',
    studentIndex: 2,
    colorMode: 'bw',
    sides: 'single',
    copies: 1,
    pageCount: 20,
    pageRange: '1-5,8,11-13',
    pagesToPrint: 9,
    sheetsToPrint: 9,
    totalPaise: 1350,
    paid: true,
    createdAgoMs: 1 * DAY,
    fileName: 'question-bank.pdf',
  },
  {
    status: 'REFUNDED',
    studentIndex: 0,
    colorMode: 'bw',
    sides: 'single',
    copies: 1,
    pageCount: 24,
    pagesToPrint: 24,
    sheetsToPrint: 24,
    totalPaise: 3600, // the §18 worked example
    paid: true,
    refunded: true,
    failureCode: 'E_PAPER_JAM',
    failureDetail: 'Jam at fuser, 11 of 24 sheets delivered',
    createdAgoMs: 2 * DAY,
    fileName: 'previous-year-papers.pdf',
  },
] as const;

// ------------------------------------------------------------

async function wipe(): Promise<void> {
  // Child tables first. TRUNCATE ... CASCADE would be shorter but would also
  // happily wipe anything added later without anyone noticing.
  await prisma.ledgerEntry.deleteMany();
  await prisma.ledgerTransaction.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.rzTransfer.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderEvent.deleteMany();
  await prisma.order.deleteMany();
  await prisma.file.deleteMany();
  await prisma.botSession.deleteMany();
  await prisma.student.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.pairingCode.deleteMany();
  await prisma.device.deleteMany();
  await prisma.rateCard.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.jobQueue.deleteMany();
}

async function seedShop(): Promise<void> {
  await prisma.shop.create({
    data: {
      id: SHOP_ID,
      code: 'PESCE1',
      name: 'Sri Lakshmi Xerox',
      address: 'PESCE main gate, Mandya',
      ownerName: 'Ramesh K',
      ownerPhone: '+919800000001',
      status: 'active',
      rzLinkedAccountId: 'acc_SEEDLINKED001',
      rzAccountStatus: 'activated',
      commissionBps: COMMISSION_BPS,
      commissionMinPaise: COMMISSION_MIN_PAISE,
      createdAt: ago(30 * DAY),
    },
  });

  await prisma.rateCard.create({
    data: {
      id: RATE_CARD_ID,
      shopId: SHOP_ID,
      version: 1,
      card: RATE_CARD,
      effectiveFrom: ago(30 * DAY),
      createdAt: ago(30 * DAY),
    },
  });

  await prisma.device.create({
    data: {
      id: DEVICE_ID,
      shopId: SHOP_ID,
      name: 'Front counter PC',
      osVersion: 'Windows 11 23H2',
      appVersion: '0.1.0',
      // A real device row stores sha256(jti); this is only a placeholder that
      // is the right shape and matches no real token.
      tokenHash: 'seed-device-token-hash-not-a-real-jti',
      pairedAt: ago(29 * DAY),
      lastSeenAt: ago(20_000),
      lastHeartbeatAt: ago(12_000),
    },
  });

  await prisma.printer.createMany({
    data: [
      {
        id: PRINTER_BW_ID,
        deviceId: DEVICE_ID,
        systemName: 'HP LaserJet M1136 MFP',
        displayName: 'Counter (B/W)',
        supportsColor: false,
        supportsDuplex: true,
        paperSizes: ['A4'],
        isNetwork: false,
        priority: 10,
        lastStatus: {
          source: 'spooler',
          state: 'idle',
          paper_out: false,
          toner_low: false,
          door_open: false,
          jobs_queued: 0,
          confidence: 'high',
        },
        lastStatusAt: ago(12_000),
      },
      {
        id: PRINTER_COLOR_ID,
        deviceId: DEVICE_ID,
        systemName: 'Canon iR C3020',
        displayName: 'Back room (colour)',
        supportsColor: true,
        supportsDuplex: true,
        paperSizes: ['A4', 'A3'],
        isNetwork: true,
        snmpHost: '192.168.1.50',
        priority: 20,
        lastStatus: {
          source: 'snmp',
          state: 'offline',
          paper_out: false,
          toner_low: true,
          door_open: false,
          jobs_queued: 0,
          confidence: 'high',
        },
        lastStatusAt: ago(3 * HOUR),
      },
    ],
  });
}

async function seedStudents(): Promise<void> {
  await prisma.student.createMany({
    data: STUDENTS.map((s, i) => ({
      id: s.id,
      phoneE164: s.phoneE164,
      displayName: s.displayName,
      firstSeenAt: ago((10 - i) * DAY),
      lastSeenAt: ago(i * HOUR),
    })),
  });
}

/**
 * Writes the §18 `order_payment` transaction: the student's money in, the
 * shop's share to its wallet, the commission to Kagaz revenue. Sums to zero.
 */
async function writeOrderPayment(
  orderId: string,
  totalPaise: number,
  commissionPaise: number,
  at: Date,
): Promise<void> {
  const transactionId = newId();

  await prisma.ledgerTransaction.create({
    data: {
      id: transactionId,
      kind: 'order_payment',
      orderId,
      shopId: SHOP_ID,
      description: `Payment for order ${orderId}`,
      createdBy: 'seed',
      createdAt: at,
    },
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        transactionId,
        accountKind: 'student_inflow',
        accountRef: null,
        amountPaise: BigInt(-totalPaise),
        createdAt: at,
      },
      {
        transactionId,
        accountKind: 'shop_wallet',
        accountRef: SHOP_ID,
        amountPaise: BigInt(totalPaise - commissionPaise),
        createdAt: at,
      },
      {
        transactionId,
        accountKind: 'kagaz_revenue',
        accountRef: null,
        amountPaise: BigInt(commissionPaise),
        createdAt: at,
      },
    ],
  });
}

/**
 * The §18 `refund` transaction — the exact reverse, commission included.
 * Kagaz does not keep its cut on a failed print.
 */
async function writeRefund(
  orderId: string,
  totalPaise: number,
  commissionPaise: number,
  at: Date,
): Promise<void> {
  const transactionId = newId();

  await prisma.ledgerTransaction.create({
    data: {
      id: transactionId,
      kind: 'refund',
      orderId,
      shopId: SHOP_ID,
      description: `Refund for order ${orderId}`,
      createdBy: 'seed',
      createdAt: at,
    },
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        transactionId,
        accountKind: 'shop_wallet',
        accountRef: SHOP_ID,
        amountPaise: BigInt(-(totalPaise - commissionPaise)),
        createdAt: at,
      },
      {
        transactionId,
        accountKind: 'kagaz_revenue',
        accountRef: null,
        amountPaise: BigInt(-commissionPaise),
        createdAt: at,
      },
      {
        transactionId,
        accountKind: 'refund_outflow',
        accountRef: null,
        amountPaise: BigInt(totalPaise),
        createdAt: at,
      },
    ],
  });
}

async function seedOrders(): Promise<void> {
  let tokenNumber = 1;

  for (const spec of ORDERS) {
    const createdAt = ago(spec.createdAgoMs);
    const student = STUDENTS[spec.studentIndex];
    if (!student) throw new Error(`bad studentIndex ${spec.studentIndex}`);

    const converted = spec.status !== 'CONVERSION_FAILED';
    const fileId = newId();

    await prisma.file.create({
      data: {
        id: fileId,
        studentId: student.id,
        status: converted ? 'converted' : 'failed',
        originalName: spec.fileName,
        originalMime: spec.fileName.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalBytes: BigInt(180_000 + spec.pageCount * 4_200),
        originalKey: `uploads/${student.id}/${fileId}/${spec.fileName}`,
        ...(converted
          ? {
              pdfKey: `pdf/${student.id}/${fileId}.pdf`,
              pdfBytes: BigInt(140_000 + spec.pageCount * 3_800),
              pdfSha256: 'seed-not-a-real-digest',
              pageCount: spec.pageCount,
              thumbnailKey: `thumb/${student.id}/${fileId}.png`,
            }
          : { conversionError: 'password-protected document' }),
        // FR-39: files are deleted 24 hours after the order finishes.
        deleteAfter: new Date(createdAt.getTime() + 24 * HOUR),
        createdAt,
      },
    });

    const orderId = newId();
    const commissionPaise = spec.paid
      ? commissionFor(spec.totalPaise, COMMISSION_BPS, COMMISSION_MIN_PAISE)
      : 0;

    const terminal =
      spec.status === 'COMPLETED' || spec.status === 'REFUNDED' || spec.status === 'EXPIRED';

    await prisma.order.create({
      data: {
        id: orderId,
        shortCode: newShortCode(),
        tokenNumber: spec.paid ? tokenNumber++ : null,
        shopId: SHOP_ID,
        studentId: student.id,
        fileId,
        status: spec.status,

        colorMode: spec.colorMode,
        sides: spec.sides,
        copies: spec.copies,
        pageRange: spec.pageRange ?? null,
        pagesToPrint: spec.pagesToPrint || null,
        sheetsToPrint: spec.sheetsToPrint || null,
        paperSize: 'A4',

        rateCardId: RATE_CARD_ID,
        priceBreakdown:
          spec.totalPaise > 0
            ? {
                sheets_charged: spec.sheetsToPrint,
                rate_per_sheet_paise: Math.round(spec.totalPaise / spec.sheetsToPrint),
                subtotal_paise: spec.totalPaise,
                discount_paise: 0,
                total_paise: spec.totalPaise,
              }
            : Prisma.JsonNull,
        totalPaise: spec.totalPaise || null,
        commissionPaise: spec.paid ? commissionPaise : null,
        shopSharePaise: spec.paid ? spec.totalPaise - commissionPaise : null,
        quoteExpiresAt: new Date(createdAt.getTime() + 15 * MINUTE),

        assignedPrinterId: spec.paid
          ? spec.colorMode === 'color'
            ? PRINTER_COLOR_ID
            : PRINTER_BW_ID
          : null,
        dispatchedAt: spec.paid ? new Date(createdAt.getTime() + 40_000) : null,
        printedAt: spec.status === 'COMPLETED' ? new Date(createdAt.getTime() + 2 * MINUTE) : null,
        completedAt: terminal ? new Date(createdAt.getTime() + 3 * MINUTE) : null,

        failureCode: spec.failureCode ?? null,
        failureDetail: spec.failureDetail ?? null,

        createdAt,
        updatedAt: createdAt,
      },
    });

    // A minimal but honest event trail — DRAFT is where every order starts.
    await prisma.orderEvent.createMany({
      data: [
        {
          orderId,
          fromStatus: null,
          toStatus: 'DRAFT',
          actor: 'student',
          reason: 'seeded',
          createdAt,
        },
        {
          orderId,
          fromStatus: 'DRAFT',
          toStatus: spec.status,
          actor: 'system',
          reason: 'seeded',
          createdAt: new Date(createdAt.getTime() + 1_000),
        },
      ],
    });

    if (!spec.paid) continue;

    const paidAt = new Date(createdAt.getTime() + 30_000);
    const paymentId = newId();

    await prisma.payment.create({
      data: {
        id: paymentId,
        orderId,
        rzPaymentLinkId: `plink_seed_${orderId.slice(0, 8)}`,
        rzOrderId: `order_seed_${orderId.slice(0, 8)}`,
        rzPaymentId: `pay_seed_${orderId.slice(0, 8)}`,
        amountPaise: spec.totalPaise,
        status: spec.refunded ? 'refunded' : 'captured',
        method: 'upi',
        capturedAt: paidAt,
        createdAt,
      },
    });

    await prisma.rzTransfer.create({
      data: {
        id: newId(),
        orderId,
        shopId: SHOP_ID,
        rzTransferId: `trf_seed_${orderId.slice(0, 8)}`,
        amountPaise: spec.totalPaise - commissionPaise,
        // §19: the transfer stays on hold until the print is confirmed.
        onHold: !(spec.status === 'COMPLETED'),
        releasedAt: spec.status === 'COMPLETED' ? new Date(createdAt.getTime() + 3 * MINUTE) : null,
        status: spec.refunded ? 'reversed' : 'created',
        createdAt: paidAt,
      },
    });

    await writeOrderPayment(orderId, spec.totalPaise, commissionPaise, paidAt);

    if (spec.refunded) {
      const refundedAt = new Date(createdAt.getTime() + 4 * MINUTE);

      await prisma.refund.create({
        data: {
          id: newId(),
          orderId,
          paymentId,
          rzRefundId: `rfnd_seed_${orderId.slice(0, 8)}`,
          amountPaise: spec.totalPaise,
          reasonCode: spec.failureCode ?? 'E_UNKNOWN',
          isAutomatic: true,
          status: 'processed',
          createdAt: refundedAt,
          processedAt: refundedAt,
        },
      });

      await writeRefund(orderId, spec.totalPaise, commissionPaise, refundedAt);
    }
  }
}

async function main(): Promise<void> {
  const started = Date.now();

  await wipe();
  await seedShop();
  await seedStudents();
  await seedOrders();

  const [balance] = await prisma.$queryRaw<{ balance_paise: bigint | null }[]>`
    SELECT balance_paise FROM shop_wallet_balances WHERE shop_id = ${SHOP_ID}::uuid
  `;

  const [total] = await prisma.$queryRaw<{ sum: bigint | null }[]>`
    SELECT COALESCE(SUM(amount_paise), 0) AS sum FROM ledger_entries
  `;

  console.log(`
  Seeded in ${Date.now() - started} ms

    shop        PESCE1 — Sri Lakshmi Xerox  (${SHOP_ID})
    rate card   v1
    device      Front counter PC, 2 printers
    students    ${STUDENTS.length}
    orders      ${ORDERS.length}  (${ORDERS.filter((o) => o.paid).length} paid)

    shop wallet ${balance?.balance_paise ?? 0n} paise
    ledger sum  ${total?.sum ?? 0n} paise  (I4: must be 0)
`);
}

main()
  .catch((error: unknown) => {
    console.error('\n  Seed failed:', error, '\n');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
