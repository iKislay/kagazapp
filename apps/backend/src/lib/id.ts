import { v7 as uuidv7 } from 'uuid';

/**
 * All primary keys in this system are UUIDv7.
 *
 * Postgres 15 has no native `uuidv7()`, so ids are generated here rather than
 * by a column default. v7 rather than v4 because the first 48 bits are a
 * millisecond timestamp: ids sort chronologically, which keeps B-tree inserts
 * at the right edge of the index instead of scattering them, and makes
 * `ORDER BY id` a usable proxy for `ORDER BY created_at` when debugging.
 */
export function newId(): string {
  return uuidv7();
}

/** Crockford base32 alphabet — no I, L, O or U, so nothing is misread aloud. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a code from the Crockford alphabet using cryptographic randomness.
 *
 * Masking with 0x1f is unbiased here because 256 is an exact multiple of 32 —
 * every alphabet character maps to exactly 8 of the 256 byte values.
 */
function crockford(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (const byte of bytes) {
    out += CROCKFORD[byte & 0x1f] as string;
  }
  return out;
}

/** An 8-character pairing code, as stored in `pairing_codes.code`. */
export function newPairingCode(): string {
  return crockford(8);
}

/**
 * A short human token for an order, e.g. 'K7F2'. Read aloud at a counter and
 * printed on the cover sheet, so it avoids ambiguous characters for the same
 * reason the pairing code does.
 */
export function newShortCode(): string {
  return crockford(4);
}
