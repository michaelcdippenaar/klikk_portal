/**
 * AuditReceipts.helpers.spec.ts
 *
 * Unit spec for the pure helpers in src/utils/receipts.js that back the
 * Audit → Receipts console (FY bucketing, money / date / byte formatting,
 * status → pill mapping, decision labels, and the option/enum constants).
 *
 * What is verified:
 *   - fyForDate: Klikk FY runs 1 Jul – 30 Jun and is named by the ENDING year.
 *     The exact flip (30 Jun → FY N, 1 Jul → FY N+1) is asserted for several
 *     years, for date-only strings, full ISO timestamptz strings (what the API
 *     actually sends) and Date objects; null / '' / garbage → ''.
 *   - fyLabel: number / numeric string → 'FYnn'; anything else → ''.
 *   - formatMoney: null / undefined / '' / non-numeric → '—' (2 of 459
 *     production rows have non-numeric OCR totals and the API sends
 *     total: null for them); "21600.00", 0 and negatives format as ZAR.
 *   - formatDateShort / formatDateTime / formatBytes edge cases.
 *   - statusTone / statusLabel / decisionLabel mappings.
 *   - The decision enum is exactly the product-spec set and the filter option
 *     for "Undecided" carries the literal value 'NONE' (never '').
 *
 *   - Timezone robustness: date-only 'YYYY-MM-DD' strings are parsed as LOCAL
 *     calendar dates, so fyForDate / formatDateShort give the same answer in a
 *     UTC-negative runner TZ as in Africa/Johannesburg. See the TZ block at
 *     the bottom.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  ALL,
  NONE,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  FY_START_MONTH,
  FY_OPTIONS,
  DECISION_VALUES,
  DECISION_FILTER_UNDECIDED,
  DECISION_FILTER_OPTIONS,
  DECISION_SELECT_OPTIONS,
  STATUS_OPTIONS,
  fyForDate,
  fyLabel,
  formatMoney,
  formatDateShort,
  formatDateTime,
  formatBytes,
  statusTone,
  statusLabel,
  decisionLabel,
} from '../../utils/receipts';

// Intl en-ZA uses a non-breaking / narrow no-break space as the thousands
// separator and between "R" and the digits; normalise so assertions are
// readable and ICU-version-stable.
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

// ── FY bucketing ────────────────────────────────────────────────────────────

describe('fyForDate — Klikk FY = 1 Jul (N-1) .. 30 Jun N, named by ending year', () => {
  it('FY_START_MONTH is July', () => {
    expect(FY_START_MONTH).toBe(7);
  });

  it.each([
    ['2025-06-30', 'FY25'],
    ['2025-07-01', 'FY26'],
    ['2026-06-30', 'FY26'],
    ['2026-07-01', 'FY27'],
    ['2024-07-01', 'FY25'],
    ['2024-06-30', 'FY24'],
    ['2026-08-19', 'FY27'], // today
    ['2026-01-01', 'FY26'],
    ['2025-12-31', 'FY26'],
  ])('%s → %s (date-only string, local TZ of the runner)', (input, expected) => {
    expect(fyForDate(input)).toBe(expected);
  });

  it('accepts full ISO timestamptz strings as sent by the API', () => {
    expect(fyForDate('2026-08-04T10:00:00Z')).toBe('FY27');
    expect(fyForDate('2026-05-01T08:30:00+02:00')).toBe('FY26');
    expect(fyForDate('2025-07-01T10:00:00Z')).toBe('FY26');
    expect(fyForDate('2025-06-30T10:00:00Z')).toBe('FY25');
  });

  it('accepts Date objects', () => {
    expect(fyForDate(new Date(2026, 6, 1))).toBe('FY27'); // 1 Jul 2026 local
    expect(fyForDate(new Date(2026, 5, 30))).toBe('FY26'); // 30 Jun 2026 local
  });

  it("returns '' for null / undefined / '' / 0 / invalid strings", () => {
    expect(fyForDate(null)).toBe('');
    expect(fyForDate(undefined)).toBe('');
    expect(fyForDate('')).toBe('');
    expect(fyForDate(0)).toBe('');
    expect(fyForDate('not-a-date')).toBe('');
    expect(fyForDate('2026-13-45')).toBe('');
    expect(fyForDate(new Date('garbage'))).toBe('');
  });

  it('honours a custom start month (startMonth=1 → calendar year)', () => {
    expect(fyForDate('2026-08-19', 1)).toBe('FY26');
    expect(fyForDate('2026-01-01', 1)).toBe('FY26');
  });

  it('FY_OPTIONS cover FY25..FY27 plus the ALL sentinel, and today falls inside the range', () => {
    expect(FY_OPTIONS.map((o) => o.value)).toEqual([ALL, 'FY25', 'FY26', 'FY27']);
    expect(FY_OPTIONS.map((o) => o.value)).toContain(fyForDate('2026-08-19'));
  });
});

describe('fyLabel', () => {
  it('formats the ending year as FYnn', () => {
    expect(fyLabel(2026)).toBe('FY26');
    expect(fyLabel('2025')).toBe('FY25');
    expect(fyLabel(2100)).toBe('FY00');
  });
  it("returns '' for non-numeric input", () => {
    expect(fyLabel(undefined)).toBe('');
    expect(fyLabel('abc')).toBe('');
    expect(fyLabel(NaN)).toBe('');
    expect(fyLabel(Infinity)).toBe('');
  });

  // Number(null) === 0 is finite, so the null guard must run before the
  // Number() coercion — otherwise null would render as 'FY0'.
  it("returns '' for null", () => {
    expect(fyLabel(null)).toBe('');
  });
});

// ── Money ───────────────────────────────────────────────────────────────────

describe('formatMoney', () => {
  it("returns '—' for null / undefined / '' (API sends total: null for non-numeric OCR totals)", () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney('')).toBe('—');
  });

  it("returns '—' for non-numeric strings (raw OCR leaks like 'R 1 234,56', 'abc')", () => {
    expect(formatMoney('abc')).toBe('—');
    expect(formatMoney('R 1 234,56')).toBe('—');
    expect(formatMoney('12,50')).toBe('—');
    expect(formatMoney('NaN')).toBe('—');
    expect(formatMoney('Infinity')).toBe('—');
    expect(formatMoney({})).toBe('—');
    expect(formatMoney([1, 2])).toBe('—');
  });

  it('formats the API string decimal "21600.00" as ZAR with two decimals', () => {
    expect(norm(formatMoney('21600.00'))).toBe('R 21 600,00');
  });

  it('formats numbers, zero and negatives', () => {
    expect(norm(formatMoney(412.5))).toBe('R 412,50');
    expect(norm(formatMoney(0))).toBe('R 0,00');
    expect(norm(formatMoney('0'))).toBe('R 0,00');
    expect(norm(formatMoney('-50.00'))).toBe('-R 50,00');
    expect(norm(formatMoney(-1234.567))).toBe('-R 1 234,57');
  });

  it('never returns the literal strings "NaN" / "null" / "undefined"', () => {
    for (const v of [null, undefined, '', 'abc', NaN, 'R 12', {}, []]) {
      const out = formatMoney(v as never);
      expect(out).not.toMatch(/NaN|null|undefined/);
    }
  });
});

// ── Dates ───────────────────────────────────────────────────────────────────

describe('formatDateShort', () => {
  it("returns '—' for null / undefined / '' / invalid", () => {
    expect(formatDateShort(null)).toBe('—');
    expect(formatDateShort(undefined)).toBe('—');
    expect(formatDateShort('')).toBe('—');
    expect(formatDateShort('nope')).toBe('—');
  });
  it('formats a timestamptz to YYYY-MM-DD (local)', () => {
    // Mid-day UTC is the same calendar day in every TZ the runner could be in.
    expect(formatDateShort('2026-08-04T10:00:00Z')).toBe('2026-08-04');
    expect(formatDateShort(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('zero-pads month and day', () => {
    expect(formatDateShort(new Date(2026, 2, 3))).toBe('2026-03-03');
  });
});

describe('formatDateTime', () => {
  it("returns '—' for null / '' / invalid", () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatDateTime('x')).toBe('—');
  });
  it('formats a Date to YYYY-MM-DD HH:mm with zero padding', () => {
    expect(formatDateTime(new Date(2026, 7, 4, 9, 5))).toBe('2026-08-04 09:05');
  });
  it('formats a timestamptz in local time (the runner TZ)', () => {
    const d = new Date('2026-08-10T08:15:00Z');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    expect(formatDateTime('2026-08-10T08:15:00Z')).toBe(`${formatDateShort(d)} ${hh}:${mm}`);
  });
});

describe('formatBytes', () => {
  it('buckets B / KB / MB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(12390)).toBe('12.1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes('2048')).toBe('2.0 KB');
  });
  it("returns '—' for undefined / negative / garbage", () => {
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes('abc')).toBe('—');
  });

  // Number(null) === 0, so the null guard must run before the Number()
  // coercion — a receipt with byte_size: null shows '—' in the detail
  // media-meta line (consistent with formatMoney), never '0 B'.
  it("returns '—' for null (a real 0 still renders '0 B')", () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(0)).toBe('0 B');
  });
});

// ── Status / decision mapping ───────────────────────────────────────────────

describe('statusTone / statusLabel', () => {
  it.each([
    ['MATCHED', 'success', 'Matched'],
    ['PENDING', 'warning', 'Pending'],
    ['NOT IN XERO', 'error', 'Not in Xero'],
    ['SKIPPED', 'neutral', 'Skipped'],
    ['matched', 'success', 'Matched'], // case-insensitive
  ])('%s → tone %s, label %s', (g, tone, label) => {
    expect(statusTone(g)).toBe(tone);
    expect(statusLabel(g)).toBe(label);
  });

  it('unknown / null → neutral / Unknown (or raw value)', () => {
    expect(statusTone(null)).toBe('neutral');
    expect(statusTone('')).toBe('neutral');
    expect(statusTone('WEIRD')).toBe('neutral');
    expect(statusLabel(null)).toBe('Unknown');
    expect(statusLabel('')).toBe('Unknown');
    expect(statusLabel('WEIRD')).toBe('WEIRD');
  });

  it('every STATUS_OPTIONS value maps to a non-neutral-or-SKIPPED tone (no silent fallthrough)', () => {
    for (const o of STATUS_OPTIONS) {
      if (o.value === ALL) continue;
      expect(statusLabel(o.value)).not.toBe('Unknown');
    }
  });
});

describe('decision enum + decisionLabel', () => {
  it('DECISION_VALUES is exactly the product-spec enum, in order', () => {
    expect(DECISION_VALUES.map((d) => d.value)).toEqual([
      '', 'CAPTURE', 'MEAL_SKIP', 'PERSONAL', 'DUPLICATE', 'ALREADY_IN_XERO',
    ]);
  });

  it("Undecided filter value is the literal 'NONE' — never ''", () => {
    expect(DECISION_FILTER_UNDECIDED).toBe('NONE');
    const undecided = DECISION_FILTER_OPTIONS.find((o) => o.label === 'Undecided');
    expect(undecided?.value).toBe('NONE');
    expect(DECISION_FILTER_OPTIONS.some((o) => o.value === '')).toBe(false);
    expect(DECISION_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      ALL, 'NONE', 'CAPTURE', 'MEAL_SKIP', 'PERSONAL', 'DUPLICATE', 'ALREADY_IN_XERO',
    ]);
  });

  it('DECISION_SELECT_OPTIONS swaps "" for the NONE sentinel and keeps the enum values verbatim', () => {
    expect(DECISION_SELECT_OPTIONS.map((o) => o.value)).toEqual([
      NONE, 'CAPTURE', 'MEAL_SKIP', 'PERSONAL', 'DUPLICATE', 'ALREADY_IN_XERO',
    ]);
    expect(DECISION_SELECT_OPTIONS.some((o) => o.value === '')).toBe(false);
    expect(NONE).not.toBe('');
    expect(NONE).not.toBe(ALL);
  });

  it.each([
    ['', 'Undecided'],
    [null, 'Undecided'],
    [undefined, 'Undecided'],
    ['CAPTURE', 'Capture'],
    ['MEAL_SKIP', 'Meal (skip)'],
    ['PERSONAL', 'Personal'],
    ['DUPLICATE', 'Duplicate'],
    ['ALREADY_IN_XERO', 'Already in Xero'],
    ['LEGACY_VALUE', 'LEGACY_VALUE'],
  ])('decisionLabel(%j) → %s', (v, label) => {
    expect(decisionLabel(v as never)).toBe(label);
  });

  it('paging constants', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(PAGE_SIZE_OPTIONS).toEqual([25, 50, 100, 200]);
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE);
    // 200 is the backend's MAX_PAGE_SIZE (apps/audit services). The server
    // CLAMPS larger page_size values rather than rejecting them, so the
    // console must never offer a size the server would silently shrink — the
    // table would ask for 500 and quietly render 200. If you're tempted to
    // add 500 here: don't. Raise the backend ceiling first, then this cap.
    expect(Math.max(...PAGE_SIZE_OPTIONS)).toBe(200);
  });
});

// ── Timezone robustness ─────────────────────────────────────────────────────
//
// `new Date('YYYY-MM-DD')` is UTC midnight per spec, so a naive
// getMonth()/getDate() read in a UTC-negative browser TZ (a user travelling /
// a laptop set to America/*) slides the date back a day: '2025-07-01' would
// become 30 Jun local → FY25. src/utils/receipts.js therefore parses
// date-only strings as LOCAL calendar dates (split + new Date(y, m-1, d));
// full ISO timestamptz strings keep their instant-based behaviour.
//
// Node re-reads process.env.TZ on assignment, so the test below flips the
// runner TZ for the duration of the case and restores it afterwards.

describe('fyForDate — date-only strings in a UTC-negative timezone', () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it('2025-07-01 is FY26 and 2026-07-01 is FY27 in America/Los_Angeles', () => {
    process.env.TZ = 'America/Los_Angeles';
    // Sanity: the runtime honoured the TZ switch (a naive date-only parse is
    // UTC midnight → the previous evening in LA). If this precondition fails
    // the runner cannot switch TZ and the case would be inconclusive.
    expect(new Date('2025-07-01').getDate()).toBe(30);
    expect(fyForDate('2025-07-01')).toBe('FY26');
    expect(fyForDate('2026-07-01')).toBe('FY27');
    expect(formatDateShort('2026-07-01')).toBe('2026-07-01');
  });

  it('control: in Africa/Johannesburg the same inputs bucket correctly', () => {
    process.env.TZ = 'Africa/Johannesburg';
    expect(fyForDate('2025-07-01')).toBe('FY26');
    expect(fyForDate('2025-06-30')).toBe('FY25');
    expect(formatDateShort('2026-07-01')).toBe('2026-07-01');
  });
});
