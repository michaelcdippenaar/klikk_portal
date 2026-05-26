/**
 * InvestecAccount.aria-controls.spec.ts
 *
 * F6 — aria-controls linking filter inputs to the table region.
 * F7 — Magic-number 372 replaced by named constant TABLE_CHROME_OFFSET_PX.
 *
 * Strategy: parse the SFC source as text — consistent with the project's
 * node-environment test pattern; no DOM / @vue/test-utils required.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SFC_PATH = resolve(__dirname, '../InvestecAccount.vue');
const source = readFileSync(SFC_PATH, 'utf-8');

describe('InvestecAccount — F6 aria-controls (filter → table region)', () => {
  it('tableRegionId constant is declared in <script setup>', () => {
    expect(source).toContain('tableRegionId');
  });

  it('KTable receives :id="tableRegionId"', () => {
    expect(source).toContain(':id="tableRegionId"');
  });

  it('Description filter KInput has :aria-controls="tableRegionId"', () => {
    // The description KInput must carry :aria-controls
    expect(source).toContain(':aria-controls="tableRegionId"');
  });

  it('all five filter controls carry aria-controls (count ≥ 5)', () => {
    // There are 4 KInput + 1 KSelect in the filter bar; each must have aria-controls
    const matches = source.match(/:aria-controls="tableRegionId"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(5);
  });

  it('tableRegionId is stable — uses a kt- prefixed random id, not 372', () => {
    // The id must not be derived from the viewport-offset constant
    expect(source).toContain('kt-investec-');
  });
});

describe('InvestecAccount — F7 magic-number extraction', () => {
  it('TABLE_CHROME_OFFSET_PX constant is declared', () => {
    expect(source).toContain('TABLE_CHROME_OFFSET_PX');
  });

  it('TABLE_CHROME_OFFSET_PX is set to 372', () => {
    expect(source).toContain('TABLE_CHROME_OFFSET_PX = 372');
  });

  it('bare literal 372 no longer appears outside of the constant declaration', () => {
    // Strip the declaration line and verify no other bare 372 remains
    const withoutDecl = source.replace(/TABLE_CHROME_OFFSET_PX\s*=\s*372/, '');
    // Should not find a standalone 372 (not part of a larger number)
    expect(withoutDecl).not.toMatch(/(?<!\d)372(?!\d)/);
  });

  it('tableHeight computed references TABLE_CHROME_OFFSET_PX, not 372', () => {
    // Search only in the <script> block so we don't match the template usage
    const scriptStart = source.indexOf('<script setup>');
    const scriptSource = source.slice(scriptStart);
    const tableHeightIdx = scriptSource.indexOf('tableHeight');
    const tableHeightBlock = scriptSource.slice(tableHeightIdx, tableHeightIdx + 200);
    expect(tableHeightBlock).toContain('TABLE_CHROME_OFFSET_PX');
    expect(tableHeightBlock).not.toMatch(/(?<!\d)372(?!\d)/);
  });
});
