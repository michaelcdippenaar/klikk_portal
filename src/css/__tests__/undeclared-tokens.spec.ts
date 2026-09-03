/**
 * undeclared-tokens.spec — a token that is REFERENCED must be DECLARED.
 *
 * `var(--k-border, #e3e3e3)` looks like a token and is not one. Nothing in this
 * repo ever declared `--k-border`, `--k-subtle`, `--k-success` or `--k-danger`,
 * so every one of those references silently fell through to its hard-coded
 * fallback. In light mode that reads as "slightly off". In DARK mode it is a
 * light-grey border and a near-black chip on a dark card — the theme simply
 * does not apply, and nothing anywhere reports it. There is no error, no
 * console warning, and no failing test: a fallback is exactly as valid CSS as
 * a token, which is what made it survive review.
 *
 * The design system's token layer is `--kdl-*`, declared in src/css/klikk.css
 * under `:root` and `:root[data-theme="dark"]`. A value that wants light/dark
 * behaviour has to come from there. A parallel `--k-*` family would have been
 * a second token layer with no dark-mode block, which is the same defect with
 * a declaration in front of it.
 *
 * So this asserts the property that actually matters — every custom property
 * the tree reads is one the tree writes — rather than the presence of four
 * specific names. It is a RATCHET: KNOWN_UNDECLARED lists what was already
 * broken when this guard was written, and it may shrink but never grow.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const STYLED = /\.(vue|css|sass|scss)$/;

/**
 * Set at RUNTIME, not in a stylesheet, so there is nothing to declare:
 *   --reka-*      written by reka-ui on its own portal elements
 *   --row-indent  written by PivotExplorer via :style, per row level
 *   --se-indent   the same, in SetEditor
 * These are the sanctioned use of a computed inline custom property.
 */
const RUNTIME_SET = [/^--reka-/, /^--row-indent$/, /^--se-indent$/];

/**
 * Pre-existing debt, present before this guard and NOT introduced by it.
 *
 * Each of these is a real rendering defect of the same kind: a page reaching
 * for a token name the system does not have, and silently getting its
 * fallback. Fixing them is a design call per site (is `--kdl-error` meant to
 * be `--kdl-status-danger`? is `--kdl-surface` `--kdl-card-bg` or
 * `--kdl-surface-sunken`?), so they are recorded rather than guessed at.
 *
 * THIS LIST MAY ONLY SHRINK. Adding to it is adding a rendering defect.
 */
const KNOWN_UNDECLARED = new Set([
  '--kdl-accent-soft',    // FinancialInvestmentStrategy.vue
  '--kdl-border-strong',  // PipelineLayout.vue, FinancialInvestments.vue, Reporting.vue
  '--kdl-card-bg-rgb',    // KTable.vue
  '--kdl-error',          // AiAgent.vue, Comparison.vue
  '--kdl-selected-bg',    // AiAgent.vue
  '--kdl-status-error',   // AgentMonitor.vue, Credentials.vue, DividendForecast.vue, …
  '--kdl-surface',        // Reporting.vue
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // Specs quote token PREFIXES as assertion strings ("var(--kdl-space-"),
      // which are not references to anything.
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(p, out);
    } else if (STYLED.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC);
const sources = files.map((p) => [relative(SRC, p), readFileSync(p, 'utf-8')] as const);

const declared = new Set<string>();
for (const [, text] of sources) {
  for (const m of text.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) declared.add(m[1]);
}

/** token -> the files that read it without anyone declaring it. */
const undeclared = new Map<string, string[]>();
for (const [file, text] of sources) {
  for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
    const token = m[1];
    if (declared.has(token)) continue;
    if (RUNTIME_SET.some((re) => re.test(token))) continue;
    const at = undeclared.get(token) ?? [];
    if (!at.includes(file)) at.push(file);
    undeclared.set(token, at);
  }
}

describe('every custom property referenced in src/ is declared in src/', () => {
  it('scanned a realistic number of styled files', () => {
    // Guard the guard: a broken walk would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(40);
    expect(declared.has('--kdl-border')).toBe(true);
    expect(declared.has('--kdl-status-danger')).toBe(true);
  });

  it('introduces no NEW undeclared token', () => {
    const fresh = [...undeclared.entries()].filter(([t]) => !KNOWN_UNDECLARED.has(t));
    expect(
      fresh.map(([t, at]) => `${t} — read in ${at.join(', ')}`),
      'declare these in src/css/klikk.css (light AND dark), or use an existing --kdl-* token',
    ).toEqual([]);
  });

  it('has retired the --k-* family that had no declarations at all', () => {
    // The four this guard was written for. They were read ten times between
    // them, in AuditComments.vue, and declared nowhere.
    for (const token of ['--k-border', '--k-subtle', '--k-success', '--k-danger']) {
      expect(undeclared.has(token), `${token} is referenced but declared nowhere`).toBe(false);
      expect(declared.has(token), `${token} is a second token layer — use --kdl-*`).toBe(false);
    }
  });

  it('keeps the known-undeclared list honest — no entry that is already fixed', () => {
    // A stale allowance is a hole. If a token has been declared or its last
    // reference removed, it comes off the list.
    const stale = [...KNOWN_UNDECLARED].filter((t) => !undeclared.has(t));
    expect(stale, 'these are fixed — remove them from KNOWN_UNDECLARED').toEqual([]);
  });
});

describe('the comments surface carries no colour literals of its own', () => {
  const page = readFileSync(join(SRC, 'pages/AuditComments.vue'), 'utf-8');
  const style = page.slice(page.indexOf('<style'));

  it('declares no hex or rgb() in its scoped styles', () => {
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('takes its colours from the shared token layer', () => {
    expect(style).toContain('var(--kdl-border)');
    expect(style).toContain('var(--kdl-border-subtle)');
    expect(style).toContain('var(--kdl-status-success)');
    expect(style).toContain('var(--kdl-status-danger)');
  });
});
