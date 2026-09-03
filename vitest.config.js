import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      src: fileURLToPath(new URL('./src', import.meta.url)),
      quasar: fileURLToPath(new URL('./src/components/_QuasarStubs.js', import.meta.url)),
    },
  },
  test: {
    // Mount-based specs on real pages (200-row receipts, the 113-row comment
    // register) are O(rows) BY DESIGN -- the row count is the point of the
    // assertion. Under full-suite parallelism they exceeded the 5s default and
    // failed on LOAD rather than on behaviour, on a different disjoint set each
    // run: a ship gate that fails differently every time is not a gate. The real
    // budget for those specs is their call-count assertions, not wall-clock.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: 'node',
  },
});
