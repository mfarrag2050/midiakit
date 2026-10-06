import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['app/[(]app[)]/reels/**/*.test.ts'],
    environment: 'node',
    setupFiles: [],
  },
});
