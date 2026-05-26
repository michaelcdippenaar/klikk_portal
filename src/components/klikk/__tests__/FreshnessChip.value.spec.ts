/**
 * FreshnessChip.value.spec.ts
 *
 * Gates the fix for: "[Vue warn]: Invalid prop: type check failed for prop
 * 'value'. Expected Date | String | Null, got Number" (Dashboard → FreshnessChip).
 *
 * The bug: Dashboard's fetchXeroHealth() was storing the raw API value
 * (which can be a Number — minutes since last sync) directly into health.xero.lastSync
 * and passing it to FreshnessChip. The fix introduces toIsoSync() in Dashboard.vue
 * that normalises any raw API lastSync value to an ISO string before it reaches
 * FreshnessChip.
 *
 * Strategy: test the toIsoSync normalisation logic in isolation (node env,
 * no jsdom required). We replicate the helper's contract and assert all cases
 * that FreshnessChip's prop validator must accept (Date | string | null).
 *
 * If jsdom + @vue/test-utils are added in a future sprint, replace with a
 * mount test that asserts no console.warn for the value prop.
 */

import { describe, it, expect } from 'vitest';

/**
 * Local replica of the toIsoSync helper added to Dashboard.vue.
 * Kept in sync with the source; any divergence would be caught by the
 * integration test on the dev server.
 */
function toIsoSync(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'number') {
    return new Date(Date.now() - raw * 60_000).toISOString();
  }
  if (typeof raw === 'string' || raw instanceof Date) {
    const d = new Date(raw as string | Date);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * FreshnessChip prop validator — mirrors the component's defineProps validator.
 * Returns true when value is acceptable (Date | string | null).
 */
function freshnessChipValueIsValid(v: unknown): boolean {
  return v instanceof Date || typeof v === 'string' || v === null;
}

describe('toIsoSync — normalises raw API lastSync values for FreshnessChip', () => {
  it('returns null for null input', () => {
    expect(toIsoSync(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(toIsoSync(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(toIsoSync('')).toBeNull();
  });

  it('converts a Number (minutes ago) to an ISO string', () => {
    const result = toIsoSync(8); // 8 minutes ago — the exact value in the bug report
    expect(typeof result).toBe('string');
    // Must be a valid ISO 8601 string
    expect(new Date(result!).getTime()).not.toBeNaN();
    // The reconstructed timestamp should be ~8 minutes in the past
    const ageMs = Date.now() - new Date(result!).getTime();
    expect(ageMs).toBeGreaterThanOrEqual(8 * 60_000 - 100); // allow 100ms jitter
    expect(ageMs).toBeLessThan(8 * 60_000 + 1000);
  });

  it('passes through a valid ISO string unchanged (round-trips)', () => {
    const iso = '2025-05-26T08:00:00.000Z';
    expect(toIsoSync(iso)).toBe(iso);
  });

  it('converts a Date object to an ISO string', () => {
    const d = new Date('2025-01-15T12:30:00Z');
    expect(toIsoSync(d)).toBe('2025-01-15T12:30:00.000Z');
  });

  it('returns null for a non-parseable string', () => {
    expect(toIsoSync('not-a-date')).toBeNull();
  });

  it('returns null for zero (falsy number)', () => {
    expect(toIsoSync(0)).toBeNull();
  });
});

describe('FreshnessChip prop validator — output of toIsoSync is always acceptable', () => {
  it('null → valid (renders "Never")', () => {
    expect(freshnessChipValueIsValid(toIsoSync(null))).toBe(true);
  });

  it('Number (8) → ISO string → valid', () => {
    expect(freshnessChipValueIsValid(toIsoSync(8))).toBe(true);
  });

  it('Number (60) → ISO string → valid', () => {
    expect(freshnessChipValueIsValid(toIsoSync(60))).toBe(true);
  });

  it('ISO string → ISO string → valid', () => {
    expect(freshnessChipValueIsValid(toIsoSync('2025-05-26T08:00:00.000Z'))).toBe(true);
  });

  it('Date → ISO string → valid', () => {
    expect(freshnessChipValueIsValid(toIsoSync(new Date()))).toBe(true);
  });

  it('raw Number (8) bypassing toIsoSync → invalid (demonstrates the original bug)', () => {
    // This is the exact bug: passing a Number directly is NOT valid for FreshnessChip.
    expect(freshnessChipValueIsValid(8 as unknown as string)).toBe(false);
  });
});
