/**
 * inline-style-policy.spec.ts
 *
 * CI guard: asserts that no .vue file under src/pages/ contains a literal
 * style="..." attribute with CSS property declarations.
 *
 * Policy: all styling must live in <style scoped> blocks or shared utility
 * classes — never in inline style="..." strings. Dynamic :style="{...}"
 * bindings (computed values, e.g. progress bar widths) are policy-allowed
 * and are NOT matched by this check.
 *
 * Allow-list: files/patterns explicitly exempted with documented rationale.
 * Currently empty — all pages are clean.
 *
 * If this test fails, move the offending declaration to a scoped class and
 * add it to the allow-list only if there is a genuine reason it cannot be
 * moved (e.g. a third-party component that requires inline style).
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── Config ────────────────────────────────────────────────────────────────────

const PAGES_DIR = resolve(__dirname, '../');

/**
 * Regex that matches literal style="..." attributes (not :style="...").
 * Captures only attributes that contain at least one CSS property declaration
 * (i.e. a word followed by a colon, like `max-width:`, `color:`, etc.).
 *
 * Does NOT match:
 *   :style="..."          — dynamic binding, policy-allowed
 *   v-bind:style="..."    — dynamic binding, policy-allowed
 *
 * Implementation note: we use a two-step approach rather than a lookbehind
 * with a character class (which is invalid in some JS engines) — we match
 * everything then discard hits that are preceded by ':'.
 */
const LITERAL_STYLE_ATTR = /\bstyle="[^"]*[a-z][a-z-]*\s*:[^"]+"/g;

/**
 * Explicit allow-list. Each entry documents why the violation is acceptable.
 * Format: { file: 'Filename.vue', line: N, reason: '...' }
 *
 * Currently empty — all pages pass without exemptions.
 */
const ALLOW_LIST: Array<{ file: string; line: number; reason: string }> = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectVueFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    // Skip __tests__ subdirectories to avoid scanning this file itself
    if (stat.isDirectory() && entry !== '__tests__') {
      results.push(...collectVueFiles(fullPath));
    } else if (entry.endsWith('.vue')) {
      results.push(fullPath);
    }
  }
  return results;
}

interface Violation {
  file: string;
  line: number;
  column: number;
  snippet: string;
}

function findViolations(filePath: string): Violation[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  // Track whether we're inside a <style> block. CSS comments in <style scoped>
  // may contain text like style="..." referring to removed inline styles — these
  // are stale comments, not policy violations. We skip all <style> block lines.
  let inStyleBlock = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    if (/<style[\s>]/.test(line)) { inStyleBlock = true; }
    if (/<\/style>/.test(line))   { inStyleBlock = false; continue; }
    if (inStyleBlock) continue;

    let match: RegExpExecArray | null;
    LITERAL_STYLE_ATTR.lastIndex = 0; // reset stateful regex
    while ((match = LITERAL_STYLE_ATTR.exec(line)) !== null) {
      // Skip dynamic :style="..." and v-bind:style="..." bindings
      const charBefore = match.index > 0 ? line[match.index - 1] : '';
      if (charBefore === ':') continue;

      violations.push({
        file: filePath,
        line: lineIdx + 1,
        column: match.index + 1,
        snippet: match[0].slice(0, 80),
      });
    }
  }

  return violations;
}

function isAllowed(violation: Violation): boolean {
  const fileName = violation.file.split('/').pop() ?? '';
  return ALLOW_LIST.some(
    (entry) => entry.file === fileName && entry.line === violation.line
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

describe('KDL no-inline-style policy — src/pages/', () => {
  it('has zero literal style="..." attributes across all page components', () => {
    const vueFiles = collectVueFiles(PAGES_DIR);

    expect(vueFiles.length).toBeGreaterThan(0);

    const allViolations: Violation[] = [];

    for (const file of vueFiles) {
      const violations = findViolations(file).filter((v) => !isAllowed(v));
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      const report = allViolations
        .map(
          (v) =>
            `  ${v.file.replace(PAGES_DIR + '/', '')}:${v.line}:${v.column}\n    ${v.snippet}`
        )
        .join('\n\n');

      throw new Error(
        `Found ${allViolations.length} inline style violation(s) in src/pages/.\n` +
          `Move each declaration to a scoped class, or add to ALLOW_LIST with a reason.\n\n` +
          report
      );
    }
  });
});
