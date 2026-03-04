import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/__tests__/integration/**/*.test.js'],
    testTimeout: 30000,
    mockReset: true,
  },
});
