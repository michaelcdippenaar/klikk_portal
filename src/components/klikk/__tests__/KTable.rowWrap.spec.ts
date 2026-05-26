/**
 * KTable.rowWrap.spec.ts
 *
 * Vitest gate for F3 — virtual-row height contract.
 *
 * MECHANISM: Without white-space: nowrap on .ktable-td, long descriptions
 * (50-80 char EFT refs) wrap inside the cell. The virtualizer fixes each row
 * at 44px (estimateSize). The next row is pinned at top: N*44px regardless,
 * so wrapped content overlaps it. Fix: add nowrap + ellipsis to .ktable-td.
 *
 * STRATEGY: Vitest environment is "node" — no jsdom, no computed styles.
 * We read KTable.vue source and assert the three required CSS rules are
 * present in the .ktable-td selector block (same approach as portals-z-index
 * spec which reads CSS files directly to avoid the node-env limitation).
 *
 * Assertions:
 *   1. .ktable-td block contains white-space: nowrap
 *   2. .ktable-td block contains overflow: hidden
 *   3. .ktable-td block contains text-overflow: ellipsis
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const ROOT = new URL('../../../../', import.meta.url);

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8');
}

const ktableVue = readSrc('src/components/klikk/KTable.vue');

// ── Helper: extract the first CSS block for a given selector ─────────────────

function extractCssBlock(source: string, selector: string): string | null {
  // Escape the selector for use in regex
  const escapedSelector = selector.replace(/[.[\]{}()*+?^$|]/g, '\\$&');
  // Match the selector followed by its {…} block (non-greedy, handles nested)
  const re = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 's');
  const m = re.exec(source);
  return m ? m[1] : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KTable F3 — .ktable-td nowrap + ellipsis (virtual-row height contract)', () => {
  it('.ktable-td block exists in KTable.vue <style>', () => {
    const block = extractCssBlock(ktableVue, '.ktable-td');
    expect(block, '.ktable-td selector not found in KTable.vue').not.toBeNull();
  });

  it('.ktable-td has white-space: nowrap', () => {
    const block = extractCssBlock(ktableVue, '.ktable-td');
    expect(block).toMatch(/white-space\s*:\s*nowrap/);
  });

  it('.ktable-td has overflow: hidden', () => {
    const block = extractCssBlock(ktableVue, '.ktable-td');
    expect(block).toMatch(/overflow\s*:\s*hidden/);
  });

  it('.ktable-td has text-overflow: ellipsis', () => {
    const block = extractCssBlock(ktableVue, '.ktable-td');
    expect(block).toMatch(/text-overflow\s*:\s*ellipsis/);
  });
});
