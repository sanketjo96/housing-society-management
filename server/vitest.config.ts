import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Runs once, before any test file/worker starts — see global-setup.ts's own
    // comment for why this has to be globalSetup and not another setupFiles entry
    // (setupFiles reruns per file under parallel execution and would race a
    // still-running file when resetting shared state like a directory or table).
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/generated/**'],
    },
  },
});
