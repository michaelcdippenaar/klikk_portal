/**
 * utils/xeroQuota — Vitest spec (adversarial)
 *
 * The module is pure and total: no Vue, never throws, tolerates null /
 * partial responses. These tests go after the places it is most likely to be
 * wrong rather than confirming the author's examples:
 *
 *   - timezone: `as of HH:mm` must be LOCAL wall-clock. We flip process.env.TZ
 *     at runtime (Node re-reads TZ on assignment) and assert the SAME seen_at
 *     renders differently in UTC / SAST / New York. A hard-coded offset — or a
 *     test that only ran on the UTC VM — would not survive this.
 *   - zero: `day_remaining: 0` is the budget-exhausted case and is falsy.
 *     It must stay in truth mode and go `error`, never fall back.
 *   - degenerate input: no throw, and no `NaN` / `undefined` / `Invalid Date`
 *     in the returned string.
 *   - mode selection: truth needs BOTH a parseable seen_at AND a numeric
 *     day_remaining.
 *   - cap precedence + tone boundaries proportional to the cap (79/80/99/100 %).
 *   - tooltip honesty: fallback mode may never claim the number is Xero's own.
 *
 * Locale: `Number#toLocaleString` is pinned to en-US for the run so the
 * `1,000` assertions are deterministic regardless of the runner's LANG.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

import {
  XERO_QUOTA_FALLBACK_CAP,
  QUOTA_TOOLTIP,
  QUOTA_TOOLTIP_FALLBACK,
  resolveCap,
  hasHeaderTruth,
  usedToday,
  formatQuotaSummary,
  formatQuotaLabel,
  quotaTone,
  quotaTooltip,
} from '../xeroQuota.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SEEN_AT = '2026-08-19T20:41:03.221Z'; // 20:41 UTC · 22:41 SAST · 16:41 New York

/** Realistic truth-mode response, exactly as the backend serialises it. */
function truthStats(overrides = {}, quotaOverrides = {}) {
  return {
    by_process: { metadata: { last_run: 4, today: 12 } },
    total_today: 162,
    cap: 1000,
    ...overrides,
    quota: {
      cap: 1000,
      day_remaining: 946,
      min_remaining: 59,
      used_estimate: 54,
      seen_at: SEEN_AT,
      last_status: 200,
      tenant_id: '41ebfa0e-0000-0000-0000-000000000000',
      ...quotaOverrides,
    },
  };
}

/** Realistic fallback-mode response: header never seen, every quota field null but cap. */
function fallbackStats(overrides = {}) {
  return {
    by_process: {},
    total_today: 162,
    cap: 1000,
    quota: {
      cap: 1000,
      day_remaining: null,
      min_remaining: null,
      used_estimate: null,
      seen_at: null,
      last_status: null,
      tenant_id: null,
    },
    ...overrides,
  };
}

const DEGENERATE_INPUTS = [
  ['null', null],
  ['undefined', undefined],
  ['{}', {}],
  ['{quota: null}', { quota: null }],
  ['{quota: {}}', { quota: {} }],
  ['{quota: []}', { quota: [] }],
  ['{quota: "str"}', { quota: 'str' }],
  ['a string', 'abc'],
  ['a number', 42],
  ['{total_today: "abc"}', { total_today: 'abc' }],
  ['{total_today: NaN}', { total_today: NaN }],
  ['{total_today: Infinity}', { total_today: Infinity }],
  ['{total_today: -5}', { total_today: -5 }],
  ['{cap: 0}', { cap: 0 }],
  ['{cap: null}', { cap: null }],
  ['{cap: -1}', { cap: -1 }],
  ['{cap: NaN}', { cap: NaN }],
  ['{cap: "1000"}', { cap: '1000' }],
  ['seen_at unparseable', { quota: { seen_at: 'not-a-date', day_remaining: 5 } }],
  ['seen_at object', { quota: { seen_at: {}, day_remaining: 5 } }],
  ['seen_at but day_remaining null', { quota: { seen_at: SEEN_AT, day_remaining: null } }],
  ['seen_at but day_remaining NaN', { quota: { seen_at: SEEN_AT, day_remaining: NaN } }],
  ['seen_at but day_remaining string', { quota: { seen_at: SEEN_AT, day_remaining: '946' } }],
  ['day_remaining but seen_at missing', { quota: { day_remaining: 946 } }],
  ['day_remaining but seen_at empty string', { quota: { day_remaining: 946, seen_at: '' } }],
  ['truth with negative day_remaining', { quota: { seen_at: SEEN_AT, day_remaining: -10 } }],
  ['truth with used_estimate NaN', { quota: { seen_at: SEEN_AT, day_remaining: 5, used_estimate: NaN } }],
  ['truth with used_estimate string', { quota: { seen_at: SEEN_AT, day_remaining: 5, used_estimate: '54' } }],
  ['truth with cap 0 both levels', { cap: 0, quota: { cap: 0, seen_at: SEEN_AT, day_remaining: 5 } }],
];

// ── Locale pin ────────────────────────────────────────────────────────────────

const enUS = new Intl.NumberFormat('en-US');
let tzBefore;

beforeAll(() => {
  tzBefore = process.env.TZ;
  // Pin number formatting to en-US so `1,000` assertions don't depend on LANG.
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function pinned() {
    return enUS.format(Number(this));
  });
});

afterAll(() => {
  vi.restoreAllMocks();
  if (tzBefore === undefined) delete process.env.TZ;
  else process.env.TZ = tzBefore;
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('fallback cap is the Klikk tenant cap (1,000), not the old 5,000', () => {
    expect(XERO_QUOTA_FALLBACK_CAP).toBe(1000);
  });

  it('the two tooltips are distinct strings', () => {
    expect(QUOTA_TOOLTIP).not.toBe(QUOTA_TOOLTIP_FALLBACK);
    expect(typeof QUOTA_TOOLTIP).toBe('string');
    expect(typeof QUOTA_TOOLTIP_FALLBACK).toBe('string');
  });
});

// ── resolveCap ────────────────────────────────────────────────────────────────

describe('resolveCap', () => {
  it('uses top-level cap when present', () => {
    expect(resolveCap({ cap: 250 })).toBe(250);
  });

  it('falls through to quota.cap when top-level cap is absent', () => {
    expect(resolveCap({ quota: { cap: 250 } })).toBe(250);
  });

  it('falls through to quota.cap when top-level cap is null', () => {
    expect(resolveCap({ cap: null, quota: { cap: 250 } })).toBe(250);
  });

  it('top-level cap WINS when the two disagree (1000 top vs 250 nested)', () => {
    expect(resolveCap({ cap: 1000, quota: { cap: 250 } })).toBe(1000);
  });

  it('nested cap does NOT win over a valid top-level cap (250 top vs 1000 nested)', () => {
    expect(resolveCap({ cap: 250, quota: { cap: 1000 } })).toBe(250);
  });

  it('returns the 1,000 fallback for null / undefined / {} / older responses without cap', () => {
    expect(resolveCap(null)).toBe(1000);
    expect(resolveCap(undefined)).toBe(1000);
    expect(resolveCap({})).toBe(1000);
    expect(resolveCap({ total_today: 5 })).toBe(1000);
  });

  it('treats cap: 0 as MISSING (never divides by zero) — falls to 1,000', () => {
    expect(resolveCap({ cap: 0 })).toBe(1000);
    expect(resolveCap({ quota: { cap: 0 } })).toBe(1000);
  });

  it('treats negative / NaN / Infinity / string caps as missing', () => {
    expect(resolveCap({ cap: -1 })).toBe(1000);
    expect(resolveCap({ cap: NaN })).toBe(1000);
    expect(resolveCap({ cap: Infinity })).toBe(1000);
    expect(resolveCap({ cap: '250' })).toBe(1000);
  });

  // Documented quirk — see findings. A numeric-but-invalid top-level cap (0 or
  // negative) short-circuits the `??` chain and MASKS a valid nested quota.cap.
  // Locked here so a change in either direction is a deliberate one.
  it('QUIRK: cap: 0 at top level masks a valid nested quota.cap (returns 1,000, not 250)', () => {
    expect(resolveCap({ cap: 0, quota: { cap: 250 } })).toBe(1000);
    expect(resolveCap({ cap: -5, quota: { cap: 250 } })).toBe(1000);
  });

  it('always returns a positive finite number for every degenerate input', () => {
    for (const [, input] of DEGENERATE_INPUTS) {
      const cap = resolveCap(input);
      expect(Number.isFinite(cap)).toBe(true);
      expect(cap).toBeGreaterThan(0);
    }
  });
});

// ── hasHeaderTruth ────────────────────────────────────────────────────────────

describe('hasHeaderTruth', () => {
  it('true for the realistic truth response', () => {
    expect(hasHeaderTruth(truthStats())).toBe(true);
  });

  it('false for the realistic fallback response (all-null quota)', () => {
    expect(hasHeaderTruth(fallbackStats())).toBe(false);
  });

  it('TRUE when day_remaining is 0 (falsy but numeric — the exhausted-budget case)', () => {
    expect(hasHeaderTruth(truthStats({}, { day_remaining: 0, used_estimate: 1000 }))).toBe(true);
    expect(hasHeaderTruth({ quota: { seen_at: SEEN_AT, day_remaining: 0 } })).toBe(true);
  });

  it('false when seen_at is present but day_remaining is null', () => {
    expect(hasHeaderTruth({ quota: { seen_at: SEEN_AT, day_remaining: null } })).toBe(false);
  });

  it('false when seen_at is present but day_remaining is undefined', () => {
    expect(hasHeaderTruth({ quota: { seen_at: SEEN_AT } })).toBe(false);
  });

  it('false when day_remaining is numeric but seen_at is missing / null / empty', () => {
    expect(hasHeaderTruth({ quota: { day_remaining: 946 } })).toBe(false);
    expect(hasHeaderTruth({ quota: { day_remaining: 946, seen_at: null } })).toBe(false);
    expect(hasHeaderTruth({ quota: { day_remaining: 946, seen_at: '' } })).toBe(false);
  });

  it('false when seen_at does not parse as a date', () => {
    expect(hasHeaderTruth({ quota: { seen_at: 'not-a-date', day_remaining: 5 } })).toBe(false);
    expect(hasHeaderTruth({ quota: { seen_at: {}, day_remaining: 5 } })).toBe(false);
  });

  it('false when day_remaining is a numeric STRING (strict number typing)', () => {
    expect(hasHeaderTruth({ quota: { seen_at: SEEN_AT, day_remaining: '946' } })).toBe(false);
  });

  it('accepts a Date instance for seen_at', () => {
    expect(hasHeaderTruth({ quota: { seen_at: new Date(SEEN_AT), day_remaining: 5 } })).toBe(true);
  });

  it('false for null / undefined / {} / quota null / quota non-object', () => {
    expect(hasHeaderTruth(null)).toBe(false);
    expect(hasHeaderTruth(undefined)).toBe(false);
    expect(hasHeaderTruth({})).toBe(false);
    expect(hasHeaderTruth({ quota: null })).toBe(false);
    expect(hasHeaderTruth({ quota: 'str' })).toBe(false);
    expect(hasHeaderTruth({ quota: [] })).toBe(false);
  });
});

// ── usedToday ─────────────────────────────────────────────────────────────────

describe('usedToday', () => {
  it('truth mode → used_estimate (not total_today)', () => {
    expect(usedToday(truthStats())).toBe(54);
  });

  it('truth mode with used_estimate: 0 → 0 (not cap − remaining, not total_today)', () => {
    expect(usedToday(truthStats({ total_today: 162 }, { used_estimate: 0, day_remaining: 1000 }))).toBe(0);
  });

  it('truth mode without used_estimate → cap − day_remaining', () => {
    expect(usedToday({ cap: 1000, quota: { seen_at: SEEN_AT, day_remaining: 946 } })).toBe(54);
    expect(usedToday({ cap: 250, quota: { seen_at: SEEN_AT, day_remaining: 50 } })).toBe(200);
  });

  it('truth mode, day_remaining: 0, no used_estimate → the full cap (1,000)', () => {
    expect(usedToday({ cap: 1000, quota: { seen_at: SEEN_AT, day_remaining: 0, used_estimate: null } })).toBe(1000);
  });

  it('fallback mode → total_today', () => {
    expect(usedToday(fallbackStats())).toBe(162);
  });

  it('fallback mode with total_today: 0 → 0', () => {
    expect(usedToday(fallbackStats({ total_today: 0 }))).toBe(0);
  });

  it('is never negative (negative used_estimate / negative total_today clamp to 0)', () => {
    expect(usedToday(truthStats({}, { used_estimate: -3 }))).toBe(0);
    expect(usedToday({ total_today: -5 })).toBe(0);
  });

  it('negative day_remaining without used_estimate → cap + |remaining| (clamped ≥ 0, finite)', () => {
    expect(usedToday({ cap: 1000, quota: { seen_at: SEEN_AT, day_remaining: -10 } })).toBe(1010);
  });

  it('is a finite non-negative number for every degenerate input', () => {
    for (const [, input] of DEGENERATE_INPUTS) {
      const u = usedToday(input);
      expect(Number.isFinite(u)).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── formatQuotaSummary / formatQuotaLabel ─────────────────────────────────────

describe('formatQuotaSummary / formatQuotaLabel — content', () => {
  beforeEach(() => {
    process.env.TZ = 'UTC';
  });

  it('truth mode renders ≈used / cap · left · as of', () => {
    expect(formatQuotaSummary(truthStats())).toBe('≈54 / 1,000 today · 946 left · as of 20:41');
    expect(formatQuotaLabel(truthStats())).toBe('Xero API: ≈54 / 1,000 today · 946 left · as of 20:41');
  });

  it('fallback mode renders the logged tally and SAYS SO', () => {
    expect(formatQuotaSummary(fallbackStats())).toBe('162 / 1,000 today (logged calls only)');
    expect(formatQuotaLabel(fallbackStats())).toBe('Xero API: 162 / 1,000 today (logged calls only)');
  });

  it('fallback mode never carries the ≈ marker; truth mode always does', () => {
    expect(formatQuotaSummary(fallbackStats())).not.toContain('≈');
    expect(formatQuotaSummary(truthStats())).toMatch(/^≈/);
  });

  it('day_remaining: 0 → "≈1,000 / 1,000 today · 0 left" (truth mode, not fallback)', () => {
    const s = formatQuotaSummary({
      cap: 1000,
      total_today: 3,
      quota: { seen_at: SEEN_AT, day_remaining: 0, used_estimate: null },
    });
    expect(s).toBe('≈1,000 / 1,000 today · 0 left · as of 20:41');
    expect(s).not.toContain('logged calls only');
  });

  it('used_estimate: 0 in truth mode → "≈0 / 1,000 today · 1,000 left"', () => {
    const s = formatQuotaSummary(truthStats({}, { used_estimate: 0, day_remaining: 1000 }));
    expect(s).toBe('≈0 / 1,000 today · 1,000 left · as of 20:41');
  });

  it('total_today: 0 in fallback mode → "0 / 1,000 today (logged calls only)"', () => {
    expect(formatQuotaSummary(fallbackStats({ total_today: 0 }))).toBe('0 / 1,000 today (logged calls only)');
  });

  it('seen_at present but day_remaining null → fallback mode (does NOT claim truth)', () => {
    const s = formatQuotaSummary({ total_today: 7, quota: { seen_at: SEEN_AT, day_remaining: null } });
    expect(s).toBe('7 / 1,000 today (logged calls only)');
    expect(s).not.toContain('as of');
  });

  it('day_remaining present but seen_at missing → fallback mode', () => {
    const s = formatQuotaSummary({ total_today: 7, quota: { day_remaining: 946 } });
    expect(s).toBe('7 / 1,000 today (logged calls only)');
  });

  it('uses the resolved cap (250) in both the label and the fallback', () => {
    expect(formatQuotaSummary({ cap: 250, quota: { seen_at: SEEN_AT, day_remaining: 50 } }))
      .toBe('≈200 / 250 today · 50 left · as of 20:41');
    expect(formatQuotaSummary({ cap: 250, total_today: 12 })).toBe('12 / 250 today (logged calls only)');
  });

  it('negative day_remaining renders "0 left", never a negative', () => {
    const s = formatQuotaSummary({ cap: 1000, quota: { seen_at: SEEN_AT, day_remaining: -10 } });
    expect(s).toBe('≈1,010 / 1,000 today · 0 left · as of 20:41');
  });

  it('formatQuotaLabel is exactly "Xero API: " + formatQuotaSummary for every degenerate input', () => {
    for (const [, input] of DEGENERATE_INPUTS) {
      expect(formatQuotaLabel(input)).toBe(`Xero API: ${formatQuotaSummary(input)}`);
    }
  });

  it('degenerate inputs: never throw, never emit NaN / undefined / null / Invalid Date, always a valid shape', () => {
    const TRUTH_RE = /^≈\d[\d,]* \/ \d[\d,]* today · \d[\d,]* left · as of \d{2}:\d{2}$/;
    const FALLBACK_RE = /^\d[\d,]* \/ \d[\d,]* today \(logged calls only\)$/;
    for (const [name, input] of DEGENERATE_INPUTS) {
      let s;
      expect(() => { s = formatQuotaSummary(input); }, name).not.toThrow();
      expect(typeof s, name).toBe('string');
      expect(s, name).not.toMatch(/NaN|undefined|null|Invalid|Infinity/);
      const ok = TRUTH_RE.test(s) || FALLBACK_RE.test(s);
      expect(ok, `${name} → "${s}"`).toBe(true);
    }
  });

  it('degenerate: the exact strings the brief listed', () => {
    expect(formatQuotaSummary(null)).toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary(undefined)).toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary({})).toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary({ quota: null })).toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary({ quota: {} })).toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary({ total_today: 'abc' })).toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary({ cap: 0 })).toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary({ cap: null })).toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary({ quota: { seen_at: 'not-a-date', day_remaining: 5 } }))
      .toBe('0 / 1,000 today (logged calls only)');
    expect(formatQuotaSummary({ quota: { seen_at: SEEN_AT, day_remaining: null } }))
      .toBe('0 / 1,000 today (logged calls only)');
  });

  it('the older backend shape (no cap, no quota) renders the logged tally on the fallback cap', () => {
    expect(formatQuotaLabel({ by_process: {}, total_today: 42 }))
      .toBe('Xero API: 42 / 1,000 today (logged calls only)');
  });
});

// ── "as of" — local time in more than one zone ────────────────────────────────

describe('formatQuotaSummary — "as of" is browser-local time', () => {
  const cases = [
    ['UTC', '20:41'],
    ['Africa/Johannesburg', '22:41'], // SAST = UTC+2 — MC's browser
    ['America/New_York', '16:41'],     // EDT in August = UTC−4
    ['Asia/Kolkata', '02:11'],         // UTC+5:30 — next day, half-hour offset
  ];

  afterEach(() => {
    process.env.TZ = 'UTC';
  });

  it.each(cases)('renders seen_at in local wall-clock for TZ=%s → %s', (tz, hhmm) => {
    process.env.TZ = tz;
    // Sanity: the runtime really did switch zones — otherwise this test is vacuous.
    expect(new Date(SEEN_AT).getHours()).toBe(Number(hhmm.slice(0, 2)));
    expect(formatQuotaSummary(truthStats())).toBe(`≈54 / 1,000 today · 946 left · as of ${hhmm}`);
  });

  it('the same seen_at renders DIFFERENTLY in UTC vs SAST (proves no hard-coded offset)', () => {
    process.env.TZ = 'UTC';
    const utc = formatQuotaSummary(truthStats());
    process.env.TZ = 'Africa/Johannesburg';
    const sast = formatQuotaSummary(truthStats());
    expect(utc).not.toBe(sast);
    expect(utc.endsWith('as of 20:41')).toBe(true);
    expect(sast.endsWith('as of 22:41')).toBe(true);
  });

  it('zero-pads hours and minutes (00:05 local)', () => {
    process.env.TZ = 'UTC';
    expect(formatQuotaSummary(truthStats({}, { seen_at: '2026-08-19T00:05:00.000Z' })))
      .toMatch(/as of 00:05$/);
  });

  it('formatTime seam: receives the parsed seen_at Date and its return is used verbatim', () => {
    const formatTime = vi.fn(() => 'SEAM');
    const out = formatQuotaSummary(truthStats(), { formatTime });
    expect(out).toBe('≈54 / 1,000 today · 946 left · as of SEAM');
    expect(formatTime).toHaveBeenCalledTimes(1);
    const arg = formatTime.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Date);
    expect(arg.toISOString()).toBe(SEEN_AT);
  });

  it('formatTime seam is NOT called in fallback mode', () => {
    const formatTime = vi.fn(() => 'SEAM');
    expect(formatQuotaSummary(fallbackStats(), { formatTime })).not.toContain('SEAM');
    expect(formatTime).not.toHaveBeenCalled();
  });

  it('formatQuotaLabel forwards opts to the seam', () => {
    expect(formatQuotaLabel(truthStats(), { formatTime: () => 'X' })).toMatch(/as of X$/);
  });
});

// ── quotaTone ─────────────────────────────────────────────────────────────────

describe('quotaTone — proportional to the resolved cap', () => {
  it('exact boundaries on cap 1,000 (fallback mode, logged tally)', () => {
    expect(quotaTone({ cap: 1000, total_today: 799 })).toBe('info');
    expect(quotaTone({ cap: 1000, total_today: 800 })).toBe('warning');
    expect(quotaTone({ cap: 1000, total_today: 999 })).toBe('warning');
    expect(quotaTone({ cap: 1000, total_today: 1000 })).toBe('error');
    expect(quotaTone({ cap: 1000, total_today: 1001 })).toBe('error');
  });

  it('exact boundaries on cap 250 (79 % / 80 % / 99.6 % / 100 %)', () => {
    expect(quotaTone({ cap: 250, total_today: 199 })).toBe('info');
    expect(quotaTone({ cap: 250, total_today: 200 })).toBe('warning');
    expect(quotaTone({ cap: 250, total_today: 249 })).toBe('warning');
    expect(quotaTone({ cap: 250, total_today: 250 })).toBe('error');
  });

  it('floating-point at exactly 80 % for awkward caps (5, 15, 35, 3) — no off-by-one', () => {
    for (const cap of [5, 15, 35, 3, 7]) {
      const at80 = (cap * 4) / 5;
      if (Number.isInteger(at80)) {
        expect(quotaTone({ cap, total_today: at80 }), `cap ${cap} used ${at80}`).toBe('warning');
        expect(quotaTone({ cap, total_today: at80 - 1 }), `cap ${cap} used ${at80 - 1}`).toBe('info');
      }
      expect(quotaTone({ cap, total_today: cap }), `cap ${cap} used ${cap}`).toBe('error');
      expect(quotaTone({ cap, total_today: cap - 1 }), `cap ${cap} used ${cap - 1}`).not.toBe('error');
    }
  });

  it('the old hard-coded 4,000/5,000 thresholds are gone: 900 / 1,000 is warning, not info', () => {
    expect(quotaTone({ total_today: 900 })).toBe('warning');          // no cap → fallback 1,000
    expect(quotaTone({ cap: 1000, total_today: 900 })).toBe('warning');
    expect(quotaTone({ total_today: 1000 })).toBe('error');
    expect(quotaTone({ total_today: 4000 })).toBe('error');           // would have been "warning" on /5,000
  });

  it('truth mode: uses used_estimate against the cap', () => {
    expect(quotaTone(truthStats())).toBe('info');                                      // 54 / 1000
    expect(quotaTone(truthStats({}, { used_estimate: 800, day_remaining: 200 }))).toBe('warning');
    expect(quotaTone(truthStats({}, { used_estimate: 1000, day_remaining: 0 }))).toBe('error');
  });

  it('day_remaining: 0 with no used_estimate → error (budget exhausted)', () => {
    expect(quotaTone({ cap: 1000, quota: { seen_at: SEEN_AT, day_remaining: 0, used_estimate: null } }))
      .toBe('error');
  });

  it('day_remaining: 0 on a 250 cap with no used_estimate → error', () => {
    expect(quotaTone({ cap: 250, quota: { seen_at: SEEN_AT, day_remaining: 0 } })).toBe('error');
  });

  it('truth mode: tone does NOT leak total_today (logged 999 but Xero says 54 used → info)', () => {
    expect(quotaTone(truthStats({ total_today: 999 }))).toBe('info');
  });

  it('every degenerate input → one of the three tones (and the all-zero ones are info)', () => {
    for (const [name, input] of DEGENERATE_INPUTS) {
      expect(['info', 'warning', 'error'], name).toContain(quotaTone(input));
    }
    expect(quotaTone(null)).toBe('info');
    expect(quotaTone({})).toBe('info');
    expect(quotaTone({ total_today: 0 })).toBe('info');
    expect(quotaTone({ cap: 0, total_today: 5 })).toBe('info'); // cap 0 → fallback 1,000, not a /0 → Infinity error
  });

  // Documented quirk — see findings. In truth mode tone is driven by
  // used_estimate, not day_remaining; when a backend used_estimate disagrees with
  // day_remaining (or the two caps disagree) the pill can show "0 left" in an
  // `info` tone. Locked so any change is deliberate.
  it('QUIRK: truth mode with day_remaining 0 but a small used_estimate is info, not error', () => {
    const stats = { cap: 1000, quota: { cap: 250, seen_at: SEEN_AT, day_remaining: 0, used_estimate: 250 } };
    expect(formatQuotaSummary(stats, { formatTime: () => 't' })).toBe('≈250 / 1,000 today · 0 left · as of t');
    expect(quotaTone(stats)).toBe('info');
  });
});

// ── quotaTooltip — honesty property ───────────────────────────────────────────

describe('quotaTooltip — never claims header-truth in fallback mode', () => {
  // The claim that makes truth mode "truth": the number SHOWN came from Xero's
  // header / is Xero's own count. (The fallback text legitimately says "Xero's
  // own count is higher" — that is the opposite claim, so it is not matched.)
  const CLAIMS_TRUTH = /read from xero|xero's own count, not ours/i;

  it('truth mode → QUOTA_TOOLTIP, which DOES claim the header reading', () => {
    expect(quotaTooltip(truthStats())).toBe(QUOTA_TOOLTIP);
    expect(QUOTA_TOOLTIP).toMatch(CLAIMS_TRUTH);
    expect(QUOTA_TOOLTIP).toContain('X-DayLimit-Remaining');
  });

  it('fallback mode → QUOTA_TOOLTIP_FALLBACK, which does NOT claim the number is Xero\'s own', () => {
    const t = quotaTooltip(fallbackStats());
    expect(t).toBe(QUOTA_TOOLTIP_FALLBACK);
    expect(t).not.toBe(QUOTA_TOOLTIP);
    expect(t).not.toMatch(CLAIMS_TRUTH);
    expect(t).toMatch(/logged/i);
    expect(t).toMatch(/not included|only/i);
    // It must point the user at the truth being HIGHER than what is shown.
    expect(t).toMatch(/xero's own count is higher/i);
  });

  it('property: whenever the label is fallback-shaped, the tooltip is the fallback tooltip — and vice versa', () => {
    const inputs = [
      ...DEGENERATE_INPUTS.map(([, i]) => i),
      truthStats(),
      fallbackStats(),
      truthStats({}, { day_remaining: 0, used_estimate: null }),
      { quota: { seen_at: SEEN_AT, day_remaining: 0 } },
      { quota: { seen_at: SEEN_AT, day_remaining: 946 } },
      { quota: { seen_at: SEEN_AT, day_remaining: null } },
      { quota: { seen_at: null, day_remaining: 946 } },
    ];
    for (const input of inputs) {
      const label = formatQuotaLabel(input, { formatTime: () => 't' });
      const tip = quotaTooltip(input);
      const labelIsFallback = label.includes('(logged calls only)');
      const labelIsTruth = label.includes('≈') && label.includes('as of');
      expect(labelIsFallback !== labelIsTruth, `ambiguous label: ${label}`).toBe(true);
      if (labelIsFallback) {
        expect(tip, `label "${label}" but tooltip claims truth`).toBe(QUOTA_TOOLTIP_FALLBACK);
        expect(tip).not.toMatch(CLAIMS_TRUTH);
      } else {
        expect(tip, `label "${label}" but tooltip is fallback`).toBe(QUOTA_TOOLTIP);
      }
      expect(hasHeaderTruth(input)).toBe(labelIsTruth);
    }
  });

  it('seen_at without a numeric day_remaining does NOT earn the truth tooltip', () => {
    expect(quotaTooltip({ quota: { seen_at: SEEN_AT, day_remaining: null } })).toBe(QUOTA_TOOLTIP_FALLBACK);
    expect(quotaTooltip({ quota: { seen_at: SEEN_AT, day_remaining: '946' } })).toBe(QUOTA_TOOLTIP_FALLBACK);
  });

  it('null / undefined / {} → fallback tooltip', () => {
    expect(quotaTooltip(null)).toBe(QUOTA_TOOLTIP_FALLBACK);
    expect(quotaTooltip(undefined)).toBe(QUOTA_TOOLTIP_FALLBACK);
    expect(quotaTooltip({})).toBe(QUOTA_TOOLTIP_FALLBACK);
  });
});

// ── Locale ────────────────────────────────────────────────────────────────────

describe('number formatting follows the runtime locale (not a hard-coded comma)', () => {
  it('with a de-DE toLocaleString, the label uses "1.000"', () => {
    const deDE = new Intl.NumberFormat('de-DE');
    const spy = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function de() {
      return deDE.format(Number(this));
    });
    try {
      expect(formatQuotaSummary(fallbackStats({ total_today: 1500, cap: 2000 })))
        .toBe('1.500 / 2.000 today (logged calls only)');
    } finally {
      spy.mockRestore();
      // re-pin en-US for any test that runs after this one
      vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function pinned() {
        return enUS.format(Number(this));
      });
    }
  });
});
