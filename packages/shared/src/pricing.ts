/**
 * The §20 pricing algorithm, as one pure function. Pricing is per physical
 * sheet, not per logical page — a 10-page document printed double-sided
 * uses 5 sheets, and is charged the `double` rate on each of those 5.
 */

import { applyBpsFloor, asPaise, maxPaise, subtractPaise, type Bps, type Paise } from './money.js';
import { parsePageRange, type PageRangeError } from './page-range.js';

export type ColorMode = 'bw' | 'color';
export type Sides = 'single' | 'double';

export interface RateCardSheetRates {
  single: number;
  double: number;
}

export interface RateCardPaperEntry {
  bw: RateCardSheetRates;
  color: RateCardSheetRates;
}

export interface VolumeDiscountTier {
  min_sheets: number;
  discount_bps: number;
}

/** The shape of `rate_cards.card` (JSONB). */
export interface RateCard {
  version: number;
  currency: string;
  min_order_paise: number;
  print: Record<string, RateCardPaperEntry>;
  volume_discounts: VolumeDiscountTier[];
  addons: unknown[];
}

export interface PricingInput {
  pageCount: number;
  /** Omit for "all pages". */
  pageRange?: string | undefined;
  copies: number;
  colorMode: ColorMode;
  sides: Sides;
  paperSize: string;
  rateCard: RateCard;
  /** From `shops.commission_bps` — not part of the rate card. */
  commissionBps: Bps;
  /** From `shops.commission_min_paise`. */
  commissionMinPaise: number;
}

export interface PriceBreakdownLine {
  kind: 'print' | 'volume_discount';
  label: string;
  amountPaise: Paise;
}

export interface PriceQuote {
  pagesToPrint: number;
  sheetsPerCopy: number;
  /** Includes the one cover sheet — never charged to the student. */
  sheetsToPrint: number;
  ratePerSheetPaise: Paise;
  breakdown: PriceBreakdownLine[];
  subtotalPaise: Paise;
  discountBps: Bps;
  discountPaise: Paise;
  totalPaise: Paise;
  commissionPaise: Paise;
  shopSharePaise: Paise;
}

export type PricingError =
  | { code: 'INVALID_PAGE_RANGE'; error: PageRangeError }
  | { code: 'ZERO_PAGES_TO_PRINT' }
  | { code: 'RATE_NOT_FOUND'; paperSize: string; colorMode: ColorMode; sides: Sides };

export type PricingResult = { ok: true; quote: PriceQuote } | { ok: false; error: PricingError };

function highestMatchingDiscountBps(tiers: VolumeDiscountTier[], sheets: number): Bps {
  let best: VolumeDiscountTier | undefined;
  for (const tier of tiers) {
    if (sheets >= tier.min_sheets && (best === undefined || tier.min_sheets > best.min_sheets)) {
      best = tier;
    }
  }
  return best?.discount_bps ?? 0;
}

export function priceOrder(input: PricingInput): PricingResult {
  const {
    pageCount,
    pageRange,
    copies,
    colorMode,
    sides,
    paperSize,
    rateCard,
    commissionBps,
    commissionMinPaise,
  } = input;

  let pagesToPrint: number;
  if (pageRange !== undefined) {
    const parsed = parsePageRange(pageRange, pageCount);
    if (!parsed.ok) {
      return { ok: false, error: { code: 'INVALID_PAGE_RANGE', error: parsed.error } };
    }
    pagesToPrint = parsed.pages.length;
  } else {
    pagesToPrint = pageCount;
  }

  if (pagesToPrint === 0) {
    return { ok: false, error: { code: 'ZERO_PAGES_TO_PRINT' } };
  }

  const sheetsPerCopy = sides === 'double' ? Math.ceil(pagesToPrint / 2) : pagesToPrint;
  const sheetsToPrint = sheetsPerCopy * copies + 1;

  const ratePerSheetRaw = rateCard.print[paperSize]?.[colorMode]?.[sides];
  if (ratePerSheetRaw === undefined) {
    return { ok: false, error: { code: 'RATE_NOT_FOUND', paperSize, colorMode, sides } };
  }
  const ratePerSheet = asPaise(ratePerSheetRaw);

  const chargeableSheets = sheetsPerCopy * copies;
  const subtotal = asPaise(chargeableSheets * ratePerSheet);

  const discountBps = highestMatchingDiscountBps(rateCard.volume_discounts, chargeableSheets);
  const discount = applyBpsFloor(subtotal, discountBps);

  const total = maxPaise(subtractPaise(subtotal, discount), asPaise(rateCard.min_order_paise));

  const commission = maxPaise(applyBpsFloor(total, commissionBps), asPaise(commissionMinPaise));
  const shopShare = subtractPaise(total, commission);

  const breakdown: PriceBreakdownLine[] = [
    {
      kind: 'print',
      label: `${chargeableSheets} sheet${chargeableSheets === 1 ? '' : 's'} × ${colorMode}/${sides}`,
      amountPaise: subtotal,
    },
  ];
  if (discount > 0) {
    breakdown.push({
      kind: 'volume_discount',
      label: `${(discountBps / 100).toFixed(2)}% volume discount`,
      amountPaise: asPaise(-discount),
    });
  }

  return {
    ok: true,
    quote: {
      pagesToPrint,
      sheetsPerCopy,
      sheetsToPrint,
      ratePerSheetPaise: ratePerSheet,
      breakdown,
      subtotalPaise: subtotal,
      discountBps,
      discountPaise: discount,
      totalPaise: total,
      commissionPaise: commission,
      shopSharePaise: shopShare,
    },
  };
}
