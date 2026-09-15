import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // The integration tests share one database and must not race each other.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
