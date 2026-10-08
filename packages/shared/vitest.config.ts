import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Pricing, page-range and order-state are the pieces where a bug
      // costs real money or real paper — they earn 100% line coverage.
      // Nothing else in this package needs to (§28 Phase 2).
      include: ['src/pricing.ts', 'src/page-range.ts', 'src/order-state.ts'],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
