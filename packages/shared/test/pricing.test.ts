import { describe, expect, it } from 'vitest';
import { formatPaise } from '../src/money.js';
import { priceOrder, type RateCard } from '../src/pricing.js';

/** The §20 worked-example rate card, verbatim. */
const RATE_CARD: RateCard = {
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

const COMMISSION_BPS = 500; // shops.commission_bps default
const COMMISSION_MIN_PAISE = 100; // shops.commission_min_paise default

function price(overrides: Partial<Parameters<typeof priceOrder>[0]>) {
  return priceOrder({
    pageCount: 12,
    copies: 1,
    colorMode: 'bw',
    sides: 'single',
    paperSize: 'A4',
    rateCard: RATE_CARD,
    commissionBps: COMMISSION_BPS,
    commissionMinPaise: COMMISSION_MIN_PAISE,
    ...overrides,
  });
}

describe('priceOrder — §20 worked examples', () => {
  it.each([
    [
      '12 pages, BW, single, 1 copy',
      { pageCount: 12, sides: 'single' as const, copies: 1 },
      12,
      0,
      1800,
    ],
    [
      '12 pages, BW, double, 1 copy',
      { pageCount: 12, sides: 'double' as const, copies: 1 },
      6,
      0,
      1500,
    ],
    [
      '12 pages, BW, double, 3 copies',
      { pageCount: 12, sides: 'double' as const, copies: 3 },
      6,
      0,
      4500,
    ],
    [
      '60 pages, BW, double, 1 copy',
      { pageCount: 60, sides: 'double' as const, copies: 1 },
      30,
      0,
      7500,
    ],
    [
      '120 pages, BW, double, 1 copy',
      { pageCount: 120, sides: 'double' as const, copies: 1 },
      60,
      750,
      14250,
    ],
  ])('%s', (_label, overrides, expectedSheetsPerCopy, expectedDiscount, expectedTotal) => {
    const result = price(overrides);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.sheetsPerCopy).toBe(expectedSheetsPerCopy);
    expect(result.quote.discountPaise).toBe(expectedDiscount);
    expect(result.quote.totalPaise).toBe(expectedTotal);
  });

  it('4 pages, colour, single, 1 copy — ₹32.00', () => {
    const result = price({ pageCount: 4, colorMode: 'color', sides: 'single', copies: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatPaise(result.quote.totalPaise)).toBe('₹32.00');
  });

  it('1 page, BW, single — ₹5.00 (min order floor applies)', () => {
    const result = price({ pageCount: 1, sides: 'single', copies: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.subtotalPaise).toBe(150);
    expect(result.quote.totalPaise).toBe(500);
    expect(formatPaise(result.quote.totalPaise)).toBe('₹5.00');
  });
});

describe('priceOrder — sheets and cover sheet', () => {
  it('single-sided: one sheet per page', () => {
    const result = price({ pageCount: 7, sides: 'single', copies: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.sheetsPerCopy).toBe(7);
  });

  it('double-sided odd page count rounds up (a lone last page still needs its own sheet)', () => {
    const result = price({ pageCount: 5, sides: 'double', copies: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.sheetsPerCopy).toBe(3);
  });

  it('sheetsToPrint includes the cover sheet, but the cover sheet is never charged', () => {
    const result = price({ pageCount: 10, sides: 'single', copies: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 10 sheets/copy * 2 copies + 1 cover sheet = 21, but only 20 are billed.
    expect(result.quote.sheetsToPrint).toBe(21);
    expect(result.quote.subtotalPaise).toBe(20 * 150);
  });
});

describe('priceOrder — volume discount tier boundaries', () => {
  it.each([
    [49, 0],
    [50, 500],
    [199, 500],
    [200, 1000],
    [500, 1000],
  ])('chargeable sheets = %i -> discountBps = %i', (sheets, expectedBps) => {
    // single-sided, 1 copy: chargeableSheets === pageCount.
    const result = price({ pageCount: sheets, sides: 'single', copies: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.discountBps).toBe(expectedBps);
  });

  it('includes a volume_discount breakdown line only when a discount applies', () => {
    const discounted = price({ pageCount: 120, sides: 'double', copies: 1 });
    expect(discounted.ok).toBe(true);
    if (discounted.ok) {
      expect(discounted.quote.breakdown.map((l) => l.kind)).toEqual(['print', 'volume_discount']);
    }

    const undiscounted = price({ pageCount: 10, sides: 'single', copies: 1 });
    expect(undiscounted.ok).toBe(true);
    if (undiscounted.ok) {
      expect(undiscounted.quote.breakdown.map((l) => l.kind)).toEqual(['print']);
    }
  });
});

describe('priceOrder — page range reduces the printed count', () => {
  it('prices only the pages selected by the range', () => {
    const result = price({ pageCount: 12, pageRange: '1-5,8', sides: 'single', copies: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.pagesToPrint).toBe(6);
    expect(result.quote.subtotalPaise).toBe(6 * 150);
  });

  it('propagates a page-range parse error instead of silently correcting it', () => {
    const result = price({ pageCount: 12, pageRange: '1-500', sides: 'single', copies: 1 });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_PAGE_RANGE',
        error: { code: 'OUT_OF_BOUNDS', input: '1-500', page: 500, pageCount: 12 },
      },
    });
  });
});

describe('priceOrder — commission split', () => {
  it('uses the basis-point commission when it exceeds the minimum', () => {
    const result = price({ pageCount: 12, sides: 'double', copies: 3 }); // total 4500
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.totalPaise).toBe(4500);
    expect(result.quote.commissionPaise).toBe(225); // floor(4500 * 500 / 10000)
    expect(result.quote.shopSharePaise).toBe(4275);
  });

  it('floors the commission to the minimum on a small order', () => {
    const result = price({ pageCount: 1, sides: 'single', copies: 1 }); // total 500 (min order)
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.commissionPaise).toBe(100); // floor(500*500/10000)=25 < min 100
    expect(result.quote.shopSharePaise).toBe(400);
  });
});

describe('priceOrder — rejections', () => {
  it('rejects zero pages to print', () => {
    const result = price({ pageCount: 0 });
    expect(result).toEqual({ ok: false, error: { code: 'ZERO_PAGES_TO_PRINT' } });
  });

  it('rejects an unknown paper size', () => {
    const result = price({ paperSize: 'A5' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'RATE_NOT_FOUND', paperSize: 'A5', colorMode: 'bw', sides: 'single' },
    });
  });

  it('rejects a colour mode the rate card does not define for a paper size', () => {
    const cardWithoutColor: RateCard = {
      ...RATE_CARD,
      print: { A4: { ...RATE_CARD.print['A4'], color: undefined as never } },
    };
    const result = priceOrder({
      pageCount: 12,
      copies: 1,
      colorMode: 'color',
      sides: 'single',
      paperSize: 'A4',
      rateCard: cardWithoutColor,
      commissionBps: COMMISSION_BPS,
      commissionMinPaise: COMMISSION_MIN_PAISE,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'RATE_NOT_FOUND', paperSize: 'A4', colorMode: 'color', sides: 'single' },
    });
  });

  it('rejects a sides mode the rate card does not define for a colour mode', () => {
    const cardWithoutDouble: RateCard = {
      ...RATE_CARD,
      print: { A4: { ...RATE_CARD.print['A4'], bw: { single: 150, double: undefined as never } } },
    };
    const result = priceOrder({
      pageCount: 12,
      copies: 1,
      colorMode: 'bw',
      sides: 'double',
      paperSize: 'A4',
      rateCard: cardWithoutDouble,
      commissionBps: COMMISSION_BPS,
      commissionMinPaise: COMMISSION_MIN_PAISE,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'RATE_NOT_FOUND', paperSize: 'A4', colorMode: 'bw', sides: 'double' },
    });
  });
});
