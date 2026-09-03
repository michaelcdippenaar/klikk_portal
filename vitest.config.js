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
    // 60s, not 30s: the mount-heavy specs were MEASURED at 35-42s
    // (AuditFindings 500-cap 35.1/36.0/37.7/39.3/39.4s, AuditReceipts
    // 200-row 40.4/42.8s). 30s was still under the floor, so they failed
    // 5/5 and 2/5 respectively -- and a timeout that fires mid-mount leaves a
    // half-patched component behind, which is the likeliest source of the
    // "Cannot read properties of null (reading 'emitsOptions')" that then hit
    // an unrelated test in the same file 3/5 runs. These specs are O(rows) by
    // design and the row count IS the assertion; their real budget is the
    // call-count guards, not wall-clock.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Cap worker threads. The heavy specs are CPU-bound mounts (200-row
    // receipts, 501-row findings, the 113-row register); with unbounded
    // parallelism they contend for cores, and the SAME spec passes in
    // isolation and times out in a full run -- which is what made this suite
    // fail on a different disjoint set each time. Capping trades a little
    // wall-clock for a result that means the same thing twice.
    poolOptions: { threads: { maxThreads: 4, minThreads: 1 } },
    environment: 'node',
  },
});
