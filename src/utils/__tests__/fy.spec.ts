/**
 * fy.spec.ts — adversarial spec for src/utils/fy.js (Klikk fiscal-year helpers).
 *
 * Klikk FY starts 1 July: FY N = 1 Jul (N-1) .. 30 Jun N (frozen contract).
 * Boundary truth: 2026-06-30 → FY2026, 2026-07-01 → FY2027.
 *
 * The helper CLAIMS to be SAST-safe by reading local calendar fields
 * (getFullYear/getMonth) rather than slicing an ISO/UTC string. This spec
 * proves it: it pins TZ to Africa/Johannesburg (UTC+2) and constructs Dates
 * whose LOCAL calendar day differs from their UTC day — an ISO-slicing
 * implementation would put them in the wrong FY.
 *
 * Junk-input contract (from the module's own docstrings): fyLabel → '' and
 * fyRange → null for non-numeric input; never throw, never render 'FYNaN'.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { currentFy, fyLabel, fyRange, FY_START_MONTH } from '../fy';

// ── TZ pinning ───────────────────────────────────────────────────────────────
// The UTC-trap tests only bite in a TZ east of UTC. Pin SAST for this file and
// restore afterwards so the worker's other spec files are unaffected.

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Africa/Johannesburg';
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// ── currentFy — boundary table ───────────────────────────────────────────────

describe('currentFy — FY boundary (FY starts 1 July)', () => {
  it('exports July as the FY start month', () => {
    expect(FY_START_MONTH).toBe(7);
  });

  // [local date parts, expected FY] — months are 0-based in the Date ctor.
  const CASES: Array<[number, number, number, number]> = [
    [2026, 5, 30, 2026], // 2026-06-30 → FY2026 (last day of FY2026)
    [2026, 6, 1, 2027],  // 2026-07-01 → FY2027 (first day of FY2027)
    [2026, 11, 31, 2027], // 2026-12-31 → FY2027
    [2027, 0, 1, 2027],  // 2027-01-01 → FY2027
    [2025, 6, 1, 2026],  // 2025-07-01 → FY2026
  ];

  for (const [y, m, d, fy] of CASES) {
    it(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')} → FY${fy}`, () => {
      expect(currentFy(new Date(y, m, d))).toBe(fy);
    });
  }

  it('defaults to today and returns a plausible integer FY', () => {
    const fy = currentFy();
    expect(Number.isInteger(fy)).toBe(true);
    expect(fy).toBeGreaterThanOrEqual(2026); // today is on/after 2026-08-20
    expect(fy).toBeLessThan(2100);
  });
});

// ── currentFy — timezone adversarial ─────────────────────────────────────────

describe('currentFy — SAST evening on the FY boundary (UTC-slice trap)', () => {
  it('2026-06-30 23:30 LOCAL is still FY2026', () => {
    const d = new Date(2026, 5, 30, 23, 30);
    expect(currentFy(d)).toBe(2026);
  });

  it('2026-07-01 00:30 LOCAL is FY2027 — even though its UTC day is 30 June', () => {
    const d = new Date(2026, 6, 1, 0, 30); // SAST 00:30 on 1 July
    // Prove the trap is armed: in SAST this instant is 2026-06-30T22:30Z.
    // If this assertion fails, TZ pinning did not take and the test below
    // would not be exercising the UTC/local divergence.
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-30');

    // An implementation that sliced the ISO string would compute FY2026 here.
    const utcYear = Number(d.toISOString().slice(0, 4));
    const utcMonth = Number(d.toISOString().slice(5, 7));
    const wrongIsoSliceFy = utcMonth >= FY_START_MONTH ? utcYear + 1 : utcYear;
    expect(wrongIsoSliceFy).toBe(2026); // the trap really would misfile it

    expect(currentFy(d)).toBe(2027); // the helper must NOT fall into it
  });

  it('2026-07-01 01:59:59.999 LOCAL (still 30 June UTC) is FY2027', () => {
    const d = new Date(2026, 6, 1, 1, 59, 59, 999); // = 2026-06-30T23:59:59.999Z
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-30');
    expect(currentFy(d)).toBe(2027);
  });
});

// ── fyLabel ──────────────────────────────────────────────────────────────────

describe('fyLabel', () => {
  it('formats a numeric FY', () => {
    expect(fyLabel(2026)).toBe('FY2026 (Jul 2025 – Jun 2026)');
    expect(fyLabel(2027)).toBe('FY2027 (Jul 2026 – Jun 2027)');
  });

  it('accepts a numeric STRING — the console stores filters.fy as a string', () => {
    expect(fyLabel('2026')).toBe('FY2026 (Jul 2025 – Jun 2026)');
  });

  it("junk input → '' (undefined)", () => {
    expect(fyLabel(undefined)).toBe('');
  });

  it("junk input → '' (null — Number(null) is 0, not NaN; must still be rejected)", () => {
    expect(fyLabel(null)).toBe('');
  });

  it("junk input → '' ('abc')", () => {
    expect(fyLabel('abc')).toBe('');
  });

  it("junk input → '' (2026.5 — non-integer)", () => {
    expect(fyLabel(2026.5)).toBe('');
  });

  it("junk input → '' (NaN)", () => {
    expect(fyLabel(NaN)).toBe('');
  });

  it("junk input → '' ('' — empty string; Number('') is 0)", () => {
    expect(fyLabel('')).toBe('');
  });

  it("never renders 'FYNaN' or a negative year for any junk input", () => {
    const junk = [undefined, null, 'abc', 2026.5, NaN, '', ' ', [], {}, true, Infinity];
    for (const j of junk) {
      let label = '<threw>';
      expect(() => { label = fyLabel(j as never); }).not.toThrow();
      expect(label).not.toContain('NaN');
      expect(label).not.toMatch(/FY-?\d{1,3}\b/); // no FY0 / FY1 / FY-…
    }
  });
});

// ── fyRange ──────────────────────────────────────────────────────────────────

describe('fyRange', () => {
  it('FY2026 = 2025-07-01 .. 2026-06-30 (matches the backend fy_bounds)', () => {
    expect(fyRange(2026)).toEqual({ start: '2025-07-01', end: '2026-06-30' });
  });

  it('FY2027 = 2026-07-01 .. 2027-06-30, and accepts a numeric string', () => {
    expect(fyRange(2027)).toEqual({ start: '2026-07-01', end: '2027-06-30' });
    expect(fyRange('2027')).toEqual({ start: '2026-07-01', end: '2027-06-30' });
  });

  it('junk input → null (undefined / "abc" / 2026.5 / NaN)', () => {
    expect(fyRange(undefined)).toBeNull();
    expect(fyRange('abc')).toBeNull();
    expect(fyRange(2026.5)).toBeNull();
    expect(fyRange(NaN)).toBeNull();
  });

  it('junk input → null (null — Number(null) is 0; a {start:"-1-07-01"} range is a lie)', () => {
    expect(fyRange(null)).toBeNull();
  });

  it("junk input → null ('' — Number('') is 0)", () => {
    expect(fyRange('')).toBeNull();
  });

  it('never throws for hostile input', () => {
    const junk = [undefined, null, 'abc', 2026.5, NaN, '', [], {}, Infinity, -Infinity];
    for (const j of junk) {
      expect(() => fyRange(j as never)).not.toThrow();
    }
  });
});
