import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/__tests__/**/*.test.js'],
    exclude: ['scripts/__tests__/integration/**'],
    setupFiles: ['scripts/__tests__/setup.js'],
    mockReset: true,
    coverage: {
      provider: 'v8',
      include: [
        'scripts/modules/helpers.js',
        'scripts/modules/core.js',
        'scripts/modules/viz.js',
        'scripts/kinetica-cli.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
