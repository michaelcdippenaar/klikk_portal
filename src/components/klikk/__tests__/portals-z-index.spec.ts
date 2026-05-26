/**
 * portals-z-index.spec.ts
 *
 * Spec 2 — Computed z-index correctness (static CSS-text strategy).
 *
 * WHY STATIC TEXT, NOT DOM:
 * The Vitest environment is "node" (no jsdom / browser). Reka UI portals teleport
 * content to <body> and use floating-ui positioning. Mounting KSelect in a node
 * environment and calling getComputedStyle() is not viable without significant
 * harness overhead that would be flakier than the static approach.
 *
 * WHAT WE ASSERT:
 *  1. portals.css contains a rule for .kselect-content that references --kdl-z-popover.
 *  2. portals.css contains a rule for .kmselect-content that references --kdl-z-popover.
 *  3. The --kdl-z-popover value defined in klikk.css is a number strictly greater
 *     than 2 (the sticky thead z-index), confirming the dropdown will overlay it.
 *  4. KSelect.vue's <style scoped> no longer contains a bare z-index integer for
 *     .kselect-content (regression guard — ensures the scoped removal held).
 *  5. KMultiSelect.vue's <style scoped> ditto for .kmselect-content.
 *
 * These five assertions give us full mechanical confidence that the stacking fix
 * is present and that the scoped-style regression cannot silently re-appear.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const ROOT = new URL('../../../../', import.meta.url);

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8');
}

const klikkcss      = readSrc('src/css/klikk.css');
const portalscss    = readSrc('src/css/portals.css');
const kselectVue    = readSrc('src/components/klikk/KSelect.vue');
const kmselectVue   = readSrc('src/components/klikk/KMultiSelect.vue');

// ── Helper: parse --kdl-z-popover value from klikk.css ─────────────────────

function parseToken(css: string, token: string): number | null {
  const re = new RegExp(`${token.replace(/-/g, '\\-')}:\\s*(\\d+)`);
  const m = re.exec(css);
  return m ? Number(m[1]) : null;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('portals z-index — KSelect', () => {
  it('portals.css has a .kselect-content block referencing --kdl-z-popover', () => {
    expect(portalscss).toContain('.kselect-content');
    // The z-index rule for .kselect-content must use the token variable
    const blockRe = /\.kselect-content[^}]*z-index[^;]*--kdl-z-popover/s;
    expect(portalscss).toMatch(blockRe);
  });

  it('--kdl-z-popover value is strictly greater than 2 (sticky-thead z-index)', () => {
    const value = parseToken(klikkcss, '--kdl-z-popover');
    expect(value, '--kdl-z-popover not found in klikk.css').not.toBeNull();
    expect(value!).toBeGreaterThan(2);
  });

  it('KSelect.vue scoped style does not contain a bare z-index integer for .kselect-content', () => {
    // Extract scoped style block (between <style scoped> and </style>)
    const scopedMatch = /<style scoped>([\s\S]*?)<\/style>/.exec(kselectVue);
    expect(scopedMatch, 'Could not find <style scoped> in KSelect.vue').not.toBeNull();
    const scopedCss = scopedMatch![1];

    // Locate the .kselect-content block and assert no z-index integer
    const contentBlockRe = /\.kselect-content\s*\{([^}]*)\}/s;
    const blockMatch = contentBlockRe.exec(scopedCss);
    if (blockMatch) {
      const block = blockMatch[1];
      expect(block).not.toMatch(/z-index\s*:\s*\d+/);
    }
    // If the class is absent from scoped entirely, the test also passes (moved to global)
  });
});

describe('portals z-index — KMultiSelect', () => {
  it('portals.css has a .kmselect-content block referencing --kdl-z-popover', () => {
    expect(portalscss).toContain('.kmselect-content');
    const blockRe = /\.kmselect-content[^}]*z-index[^;]*--kdl-z-popover/s;
    expect(portalscss).toMatch(blockRe);
  });

  it('KMultiSelect.vue scoped style does not contain a bare z-index integer for .kmselect-content', () => {
    const scopedMatch = /<style scoped>([\s\S]*?)<\/style>/.exec(kmselectVue);
    expect(scopedMatch, 'Could not find <style scoped> in KMultiSelect.vue').not.toBeNull();
    const scopedCss = scopedMatch![1];

    const contentBlockRe = /\.kmselect-content\s*\{([^}]*)\}/s;
    const blockMatch = contentBlockRe.exec(scopedCss);
    if (blockMatch) {
      const block = blockMatch[1];
      expect(block).not.toMatch(/z-index\s*:\s*\d+/);
    }
  });
});
