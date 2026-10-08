import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from '../src/index.js';

describe('@kagaz/shared', () => {
  it('exposes its identity constant', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@kagaz/shared');
  });
});
