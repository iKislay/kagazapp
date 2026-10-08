/**
 * Page range parser per §20.
 *
 * Grammar:
 *   range   := part (',' part)*
 *   part    := number | number '-' number
 *   number  := [1-9][0-9]*
 *
 * 1-indexed, inclusive, ascending within a part, duplicates deduplicated,
 * result sorted. Never silently corrects a bad range — a student who typed
 * `1-500` on a 12-page file needs to be told, not given 12 pages.
 */

export type PageRangeError =
  | { code: 'EMPTY_RESULT'; input: string }
  | { code: 'INVALID_CHARACTERS'; input: string }
  | { code: 'INVALID_SYNTAX'; input: string; part: string }
  | { code: 'ZERO_PAGE'; input: string; part: string }
  | { code: 'REVERSED_RANGE'; input: string; part: string }
  | { code: 'OUT_OF_BOUNDS'; input: string; page: number; pageCount: number };

export type PageRangeResult = { ok: true; pages: number[] } | { ok: false; error: PageRangeError };

const ALLOWED_CHARACTERS = /^[0-9,\-\s]+$/;
const PART_PATTERN = /^(0|[1-9][0-9]*)(?:-(0|[1-9][0-9]*))?$/;

/**
 * Parses a page-range string like `"1-5,8"` against a document with
 * `pageCount` pages. `pageCount` must itself be a positive integer — that is
 * the caller's responsibility, not this parser's.
 */
export function parsePageRange(input: string, pageCount: number): PageRangeResult {
  if (input.trim() === '') {
    return { ok: false, error: { code: 'EMPTY_RESULT', input } };
  }
  if (!ALLOWED_CHARACTERS.test(input)) {
    return { ok: false, error: { code: 'INVALID_CHARACTERS', input } };
  }

  const pages = new Set<number>();

  for (const rawPart of input.split(',')) {
    // Whitespace is a legal character anywhere (`ALLOWED_CHARACTERS` above)
    // precisely so a part like "1 - 5" from a student typing on a phone
    // parses the same as "1-5" — it carries no meaning, so it is stripped
    // entirely rather than merely trimmed from the ends.
    const part = rawPart.replace(/\s+/g, '');
    if (part === '') {
      return { ok: false, error: { code: 'INVALID_SYNTAX', input, part: rawPart } };
    }

    const match = PART_PATTERN.exec(part);
    if (!match) {
      return { ok: false, error: { code: 'INVALID_SYNTAX', input, part } };
    }

    const start = Number(match[1]);
    const end = match[2] !== undefined ? Number(match[2]) : start;

    if (start === 0 || end === 0) {
      return { ok: false, error: { code: 'ZERO_PAGE', input, part } };
    }
    if (end < start) {
      return { ok: false, error: { code: 'REVERSED_RANGE', input, part } };
    }
    if (start > pageCount) {
      return { ok: false, error: { code: 'OUT_OF_BOUNDS', input, page: start, pageCount } };
    }
    if (end > pageCount) {
      return { ok: false, error: { code: 'OUT_OF_BOUNDS', input, page: end, pageCount } };
    }

    for (let page = start; page <= end; page++) {
      pages.add(page);
    }
  }

  // Unreachable with an empty result: every part that reaches this point
  // adds at least one page, and an all-whitespace/empty `input` was already
  // rejected above — so `pages` is never empty here.
  return { ok: true, pages: [...pages].sort((a, b) => a - b) };
}
