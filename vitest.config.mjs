import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/tests/**/*.test.ts'],
    testTimeout: 15000,
    fileParallelism: false,
    pool: 'forks',
  },
});
