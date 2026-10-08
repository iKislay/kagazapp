import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parsePageRange } from '../src/page-range.js';

describe('parsePageRange — grammar', () => {
  it('parses a single page', () => {
    const result = parsePageRange('5', 10);
    expect(result).toEqual({ ok: true, pages: [5] });
  });

  it('parses a range', () => {
    const result = parsePageRange('1-5', 10);
    expect(result).toEqual({ ok: true, pages: [1, 2, 3, 4, 5] });
  });

  it('parses a comma list of pages and ranges', () => {
    const result = parsePageRange('1-5,8', 10);
    expect(result).toEqual({ ok: true, pages: [1, 2, 3, 4, 5, 8] });
  });

  it('deduplicates overlapping parts and sorts the result', () => {
    const result = parsePageRange('8,1-5,3-4,1', 10);
    expect(result).toEqual({ ok: true, pages: [1, 2, 3, 4, 5, 8] });
  });

  it('accepts a single-page range (start === end)', () => {
    const result = parsePageRange('4-4', 10);
    expect(result).toEqual({ ok: true, pages: [4] });
  });

  it('accepts a range spanning the whole document', () => {
    const result = parsePageRange('1-12', 12);
    expect(result).toEqual({ ok: true, pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
  });

  it('tolerates surrounding whitespace around parts', () => {
    const result = parsePageRange(' 1 - 5 , 8 ', 10);
    expect(result).toEqual({ ok: true, pages: [1, 2, 3, 4, 5, 8] });
  });
});

describe('parsePageRange — rejections', () => {
  it('rejects an empty string', () => {
    expect(parsePageRange('', 10)).toEqual({
      ok: false,
      error: { code: 'EMPTY_RESULT', input: '' },
    });
  });

  it('rejects a whitespace-only string', () => {
    expect(parsePageRange('   ', 10)).toEqual({
      ok: false,
      error: { code: 'EMPTY_RESULT', input: '   ' },
    });
  });

  it('rejects characters outside [0-9,\\-\\s]', () => {
    const result = parsePageRange('1-5;8', 10);
    expect(result).toEqual({ ok: false, error: { code: 'INVALID_CHARACTERS', input: '1-5;8' } });
  });

  it('rejects letters', () => {
    const result = parsePageRange('abc', 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_CHARACTERS');
  });

  it('rejects an empty part between commas', () => {
    const result = parsePageRange('1,,2', 10);
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_SYNTAX', input: '1,,2', part: '' },
    });
  });

  it('rejects a dangling hyphen', () => {
    const result = parsePageRange('1-', 10);
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_SYNTAX', input: '1-', part: '1-' },
    });
  });

  it('rejects page 0', () => {
    const result = parsePageRange('0', 10);
    expect(result).toEqual({ ok: false, error: { code: 'ZERO_PAGE', input: '0', part: '0' } });
  });

  it('rejects a range starting at 0', () => {
    const result = parsePageRange('0-5', 10);
    expect(result).toEqual({ ok: false, error: { code: 'ZERO_PAGE', input: '0-5', part: '0-5' } });
  });

  it('rejects a reversed range', () => {
    const result = parsePageRange('5-2', 10);
    expect(result).toEqual({
      ok: false,
      error: { code: 'REVERSED_RANGE', input: '5-2', part: '5-2' },
    });
  });

  it('rejects a single page beyond pageCount', () => {
    const result = parsePageRange('15', 10);
    expect(result).toEqual({
      ok: false,
      error: { code: 'OUT_OF_BOUNDS', input: '15', page: 15, pageCount: 10 },
    });
  });

  it('rejects a range whose end is beyond pageCount, naming the offending page — the 1-500-on-a-12-page-file case', () => {
    const result = parsePageRange('1-500', 12);
    expect(result).toEqual({
      ok: false,
      error: { code: 'OUT_OF_BOUNDS', input: '1-500', page: 500, pageCount: 12 },
    });
  });

  it('rejects a range whose start is already beyond pageCount', () => {
    const result = parsePageRange('20-25', 10);
    expect(result).toEqual({
      ok: false,
      error: { code: 'OUT_OF_BOUNDS', input: '20-25', page: 20, pageCount: 10 },
    });
  });
});

describe('parsePageRange — property: valid inputs are always sorted, deduplicated, in bounds', () => {
  function partArbitrary(pageCount: number) {
    return fc
      .tuple(fc.integer({ min: 1, max: pageCount }), fc.integer({ min: 1, max: pageCount }))
      .map(([a, b]): string => {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return lo === hi ? String(lo) : `${lo}-${hi}`;
      });
  }

  const caseArbitrary = fc
    .integer({ min: 1, max: 300 })
    .chain((pageCount) =>
      fc
        .array(partArbitrary(pageCount), { minLength: 1, maxLength: 8 })
        .map((parts): [number, string[]] => [pageCount, parts]),
    );

  it('holds for 200 random valid range strings', () => {
    fc.assert(
      fc.property(caseArbitrary, ([pageCount, parts]) => {
        const input = parts.join(',');
        const result = parsePageRange(input, pageCount);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        for (const page of result.pages) {
          expect(page).toBeGreaterThanOrEqual(1);
          expect(page).toBeLessThanOrEqual(pageCount);
        }

        for (let i = 1; i < result.pages.length; i++) {
          expect(result.pages[i]).toBeGreaterThan(result.pages[i - 1] as number);
        }

        expect(new Set(result.pages).size).toBe(result.pages.length);

        const expected = new Set<number>();
        for (const part of parts) {
          const [a, b] = part.split('-').map(Number);
          for (let p = a as number; p <= (b ?? (a as number)); p++) expected.add(p);
        }
        expect(new Set(result.pages)).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});
