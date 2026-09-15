import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/env.js';

const minimal = { DATABASE_URL: 'postgresql://u:p@localhost:5432/kagaz' };

describe('env', () => {
  it('applies the Appendix A defaults', () => {
    const env = parseEnv(minimal as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.QUOTE_TTL_MINUTES).toBe(15);
    expect(env.MAX_UPLOAD_BYTES).toBe(52_428_800);
  });

  it('refuses to boot without a database url', () => {
    expect(() => parseEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('coerces numeric vars from strings', () => {
    const env = parseEnv({
      ...minimal,
      PORT: '3000',
      HEARTBEAT_INTERVAL_MS: '5000',
    } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(3000);
    expect(env.HEARTBEAT_INTERVAL_MS).toBe(5000);
  });

  it('rejects a nonsense port instead of defaulting silently', () => {
    expect(() => parseEnv({ ...minimal, PORT: 'eighty' } as NodeJS.ProcessEnv)).toThrow(/PORT/);
  });
});
