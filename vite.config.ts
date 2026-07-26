import { defineConfig } from 'vitest/config';

// GitHub Pages project site: https://ahmadjubran.github.io/pdf-autofill/
const BASE_PATH = '/pdf-autofill/';

export default defineConfig({
  base: BASE_PATH,
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Spec section 5: coverage targets apply to the pure modules only.
      // main.ts and the proof harness are verified by hand on the device;
      // types.ts erases at compile time and has nothing to cover.
      include: ['src/fieldmap/**/*.ts', 'src/fill/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/fieldmap/types.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
