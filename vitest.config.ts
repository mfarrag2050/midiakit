import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
    // 314-A-QUEUE-EACH-TEST-OWNS · isolation setup: unique BULLMQ_PREFIX
    // per fork · تفصل tests عن real api-worker بلا مسّ production path.
    setupFiles: ['./vitest.setup.ts'],
  },
});
