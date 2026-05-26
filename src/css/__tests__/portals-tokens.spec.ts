/**
 * portals-tokens.spec.ts
 *
 * Spec 1 — Token presence.
 *
 * Reads klikk.css and portals.css as raw text and asserts:
 *  1. Each --kdl-z-* token is declared in klikk.css with a numeric value > 2
 *     (the sticky thead sits at z-index 2, so anything covering it must be higher).
 *  2. portals.css references every portal-content class with the correct token
 *     variable (not a bare magic number).
 *
 * Running in the "node" Vitest environment (no jsdom) — reading file system
 * directly is the correct strategy here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const ROOT = new URL('../../../', import.meta.url);

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8');
}

const klikkcss   = readSrc('src/css/klikk.css');
const portalscss = readSrc('src/css/portals.css');

// ── 1. Token declarations in klikk.css ──────────────────────────────────────

describe('klikk.css z-index token declarations', () => {
  const TOKENS = [
    '--kdl-z-popover',
    '--kdl-z-menu',
    '--kdl-z-tooltip',
    '--kdl-z-command-palette',
    '--kdl-z-dialog',
    '--kdl-z-toast',
  ] as const;

  for (const token of TOKENS) {
    it(`declares ${token} with a numeric value > 2`, () => {
      // Match lines like: --kdl-z-popover: 1000;
      // Escape the token for use in a regex: replace all dashes with \-
      const escapedToken = token.replace(/-/g, '\\-');
      const re = new RegExp(`${escapedToken}:\\s*(\\d+)`);
      const match = re.exec(klikkcss);
      expect(match, `Expected to find ${token} in klikk.css`).not.toBeNull();
      const value = Number(match![1]);
      expect(value).toBeGreaterThan(2);
    });
  }
});

// ── 2. portals.css uses tokens, not magic numbers ──────────────────────────

describe('portals.css portal-content class declarations', () => {
  // Each entry: [className, expectedToken]
  const PORTAL_CLASSES: Array<[string, string]> = [
    ['.kselect-content',  '--kdl-z-popover'],
    ['.kmselect-content', '--kdl-z-popover'],
    ['.km-content',       '--kdl-z-menu'],
    ['.kp-content',       '--kdl-z-popover'],
    ['.kt-content',       '--kdl-z-tooltip'],
    ['.kcp-backdrop',     '--kdl-z-command-palette'],
    ['.kcp-dialog',       '--kdl-z-command-palette'],
    ['.kd-overlay',       '--kdl-z-dialog'],
    ['.kd-content',       '--kdl-z-dialog'],
    ['.ktr-viewport',     '--kdl-z-toast'],
  ];

  for (const [cls, token] of PORTAL_CLASSES) {
    it(`${cls} sets z-index using ${token}`, () => {
      // Assert the class selector appears in portals.css
      expect(portalscss).toContain(cls);
      // Find the block for that class and assert the token variable appears near a z-index
      const escapedCls = cls.replace('.', '\\.').replace(/-/g, '\\-');
      const blockRe = new RegExp(`${escapedCls}[^}]*z-index[^;]*${token.replace(/-/g, '\\-')}`, 's');
      expect(portalscss).toMatch(blockRe);
    });
  }

  it('portals.css contains no bare magic z-index numbers (no raw integers in z-index rules)', () => {
    // Allow calc() expressions but disallow raw integer z-index (e.g. z-index: 9000)
    // Pattern: z-index: <digit> where it's not inside var(...) or calc(...)
    const magicRe = /z-index\s*:\s*\d+\s*;/g;
    const matches = portalscss.match(magicRe);
    expect(matches, `Found bare integer z-index in portals.css: ${matches}`).toBeNull();
  });
});
