/**
 * AuditReceipts.url-sync.spec.ts
 *
 * Tests the URL ⇄ filter-state ⇄ API-params contract of the Audit → Receipts
 * console: hydrateFromQuery() / buildRouteQuery() / buildApiParams() /
 * hasActiveFilters() / defaultFilters() from src/utils/receipts.js.
 *
 * Unlike the older InvestecAccount.url-sync spec this imports the REAL
 * helpers the page consumes (no mirrored copies), so a change to the page's
 * contract breaks this file.
 *
 * What is verified:
 *   - buildRouteQuery(defaultFilters()) is {} — a clean page has a clean URL
 *   - page omitted when 1; page_size omitted when 50 (the default)
 *   - full round-trip: hydrateFromQuery(buildRouteQuery(f)) deep-equals f for
 *     a filter set with EVERY filter active (numbers come back as numbers)
 *   - hostile query input (page=abc / 0 / -3 / 2.7, page_size=99999, unknown
 *     keys, min_total=notanumber, synced=yes, repeated params as arrays)
 *     degrades to sane defaults — no NaN / undefined ever reaches the API
 *   - 'Undecided' is sent as decision=NONE, never decision=''
 *   - buildApiParams drops the ALL sentinels, sends page/page_size as numbers,
 *     and omits paging for the export call
 *   - hasActiveFilters ignores paging, notices any real filter
 */

import { describe, it, expect } from 'vitest';
import {
  ALL,
  DEFAULT_PAGE_SIZE,
  DECISION_FILTER_UNDECIDED,
  defaultFilters,
  hydrateFromQuery,
  buildRouteQuery,
  buildApiParams,
  hasActiveFilters,
} from '../../utils/receipts';

const FULL = () => ({
  q: 'makro',
  fy: 'FY26',
  synced: 'true',
  status: 'NOT IN XERO',
  to_process: 'false',
  decision: DECISION_FILTER_UNDECIDED,
  date_from: '2026-01-01',
  date_to: '2026-06-30',
  page: 3,
  page_size: 25,
});

/** Recursively assert that no value in an object is NaN / undefined / null. */
function assertNoJunk(obj: Record<string, unknown>) {
  for (const [k, v] of Object.entries(obj)) {
    expect(v, `key ${k}`).not.toBeUndefined();
    expect(v, `key ${k}`).not.toBeNull();
    if (typeof v === 'number') expect(Number.isNaN(v), `key ${k} is NaN`).toBe(false);
    if (typeof v === 'string') expect(v, `key ${k}`).not.toMatch(/^(NaN|undefined|null)$/);
  }
}

// ── defaults ────────────────────────────────────────────────────────────────

describe('defaultFilters', () => {
  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = defaultFilters();
    const b = defaultFilters();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.q = 'x';
    expect(b.q).toBe('');
  });

  it('has the documented shape', () => {
    expect(defaultFilters()).toEqual({
      q: '',
      fy: ALL,
      synced: ALL,
      status: ALL,
      to_process: ALL,
      decision: ALL,
      date_from: '',
      date_to: '',
      page: 1,
      page_size: DEFAULT_PAGE_SIZE,
    });
  });
});

// ── buildRouteQuery ─────────────────────────────────────────────────────────

describe('buildRouteQuery', () => {
  it('is EMPTY for the default filter state (no junk in a clean URL)', () => {
    expect(buildRouteQuery(defaultFilters())).toEqual({});
  });

  it('omits page when 1 and page_size when 50', () => {
    expect(buildRouteQuery({ ...defaultFilters(), page: 1, page_size: 50 })).toEqual({});
    expect(buildRouteQuery({ ...defaultFilters(), page: 2 })).toEqual({ page: '2' });
    expect(buildRouteQuery({ ...defaultFilters(), page_size: 25 })).toEqual({ page_size: '25' });
    expect(buildRouteQuery({ ...defaultFilters(), page_size: 100 })).toEqual({ page_size: '100' });
  });

  it('serialises every active filter as strings', () => {
    expect(buildRouteQuery(FULL())).toEqual({
      q: 'makro',
      fy: 'FY26',
      synced: 'true',
      status: 'NOT IN XERO',
      to_process: 'false',
      decision: 'NONE',
      date_from: '2026-01-01',
      date_to: '2026-06-30',
      page: '3',
      page_size: '25',
    });
  });

  it('drops the ALL sentinel for every select filter', () => {
    const f = { ...defaultFilters(), fy: ALL, synced: ALL, status: ALL, to_process: ALL, decision: ALL };
    expect(buildRouteQuery(f)).toEqual({});
  });

  it("'false' string filters (synced / to_process) are NOT dropped as falsy", () => {
    expect(buildRouteQuery({ ...defaultFilters(), synced: 'false' })).toEqual({ synced: 'false' });
    expect(buildRouteQuery({ ...defaultFilters(), to_process: 'false' })).toEqual({ to_process: 'false' });
  });

  it('a NaN page / page_size (corrupted state) does not leak into the URL', () => {
    const q = buildRouteQuery({ ...defaultFilters(), page: NaN, page_size: NaN });
    expect(q).toEqual({});
  });
});

// ── hydrateFromQuery ────────────────────────────────────────────────────────

describe('hydrateFromQuery', () => {
  it('empty / missing query → defaults, and never mutates its input', () => {
    expect(hydrateFromQuery({})).toEqual(defaultFilters());
    expect(hydrateFromQuery()).toEqual(defaultFilters());
    const q = Object.freeze({ fy: 'FY26' });
    expect(() => hydrateFromQuery(q)).not.toThrow();
  });

  it('round-trips a fully-active filter set exactly (numbers back as numbers)', () => {
    const f = FULL();
    const back = hydrateFromQuery(buildRouteQuery(f));
    expect(back).toEqual(f);
    expect(typeof back.page).toBe('number');
    expect(typeof back.page_size).toBe('number');
  });

  it('round-trips every page_size option and several pages', () => {
    for (const size of [25, 50, 100]) {
      for (const page of [1, 2, 17]) {
        const f = { ...defaultFilters(), page, page_size: size };
        expect(hydrateFromQuery(buildRouteQuery(f))).toEqual(f);
      }
    }
  });

  it.each([
    ['abc', 1],
    ['0', 1],
    ['-3', 1],
    ['', 1],
    ['NaN', 1],
    ['Infinity', 1],
    ['2.7', 2],
    ['3abc', 1],
    ['7', 7],
  ])('page=%s → %s', (raw, expected) => {
    const f = hydrateFromQuery({ page: raw });
    expect(f.page).toBe(expected);
    expect(Number.isNaN(f.page)).toBe(false);
  });

  it.each([
    ['99999', 50],
    ['0', 50],
    ['-25', 50],
    ['abc', 50],
    ['30', 50], // not an allowed option
    ['25', 25],
    ['100', 100],
  ])('page_size=%s → %s (only 25/50/100 allowed)', (raw, expected) => {
    expect(hydrateFromQuery({ page_size: raw }).page_size).toBe(expected);
  });

  it('ignores unknown keys (min_total=notanumber, category, ordering, foo)', () => {
    const f = hydrateFromQuery({ min_total: 'notanumber', max_total: '5', category: 'Fuel', ordering: '-total', foo: 'bar' });
    expect(f).toEqual(defaultFilters());
    expect(Object.keys(f)).not.toContain('min_total');
  });

  it('synced / to_process only accept the literal "true"/"false"', () => {
    expect(hydrateFromQuery({ synced: 'yes' }).synced).toBe(ALL);
    expect(hydrateFromQuery({ synced: '1' }).synced).toBe(ALL);
    expect(hydrateFromQuery({ synced: 'TRUE' }).synced).toBe(ALL);
    expect(hydrateFromQuery({ synced: 'true' }).synced).toBe('true');
    expect(hydrateFromQuery({ to_process: 'false' }).to_process).toBe('false');
    expect(hydrateFromQuery({ to_process: 'maybe' }).to_process).toBe(ALL);
  });

  it('decision=NONE hydrates to the Undecided filter value (and is sent back out as NONE)', () => {
    const f = hydrateFromQuery({ decision: 'NONE' });
    expect(f.decision).toBe('NONE');
    expect(buildApiParams(f).decision).toBe('NONE');
    expect(buildRouteQuery(f).decision).toBe('NONE');
  });

  it('decision= (empty) hydrates to ALL — an empty decision param is never meaningful', () => {
    expect(hydrateFromQuery({ decision: '' }).decision).toBe(ALL);
    expect(buildApiParams(hydrateFromQuery({ decision: '' }))).not.toHaveProperty('decision');
  });

  it('repeated params (arrays from vue-router) take the first value; empty arrays → default', () => {
    expect(hydrateFromQuery({ fy: ['FY26', 'FY27'] }).fy).toBe('FY26');
    expect(hydrateFromQuery({ page: ['4', '9'] }).page).toBe(4);
    expect(hydrateFromQuery({ q: [] }).q).toBe('');
    expect(hydrateFromQuery({ fy: [] }).fy).toBe(ALL);
  });

  it('null query values (vue-router "?flag" with no value) fall back to defaults', () => {
    const f = hydrateFromQuery({ fy: null, q: null, page: null, synced: null });
    expect(f).toEqual(defaultFilters());
  });

  // Observation, not a hard failure: fy / status / decision are not validated
  // against their option lists, so fy=FY99 is passed through to the API as-is.
  // The API will simply return nothing for it. What we DO assert is that the
  // value is a plain string (never NaN / undefined) and that the rest of the
  // state stays sane.
  it('fy=FY99 / status=garbage are passed through as plain strings — never NaN/undefined, never corrupting other fields', () => {
    const f = hydrateFromQuery({ fy: 'FY99', status: 'garbage', page: '2' });
    expect(typeof f.fy).toBe('string');
    expect(f.fy).toBe('FY99');
    expect(f.status).toBe('garbage');
    expect(f.page).toBe(2);
    assertNoJunk(f as unknown as Record<string, unknown>);
    assertNoJunk(buildApiParams(f) as unknown as Record<string, unknown>);
  });
});

// ── buildApiParams ──────────────────────────────────────────────────────────

describe('buildApiParams', () => {
  it('default filters → only paging, as numbers', () => {
    expect(buildApiParams(defaultFilters())).toEqual({ page: 1, page_size: 50 });
  });

  it('export call (includePaging:false) → {} for defaults, filters only otherwise', () => {
    expect(buildApiParams(defaultFilters(), { includePaging: false })).toEqual({});
    const p = buildApiParams(FULL(), { includePaging: false });
    expect(p).not.toHaveProperty('page');
    expect(p).not.toHaveProperty('page_size');
    expect(p.q).toBe('makro');
  });

  it('maps a fully-active filter set 1:1 and drops sentinels', () => {
    expect(buildApiParams(FULL())).toEqual({
      q: 'makro',
      fy: 'FY26',
      synced: 'true',
      status: 'NOT IN XERO',
      to_process: 'false',
      decision: 'NONE',
      date_from: '2026-01-01',
      date_to: '2026-06-30',
      page: 3,
      page_size: 25,
    });
    const p = buildApiParams({ ...defaultFilters(), fy: ALL, decision: ALL });
    expect(p).not.toHaveProperty('fy');
    expect(p).not.toHaveProperty('decision');
  });

  it("Undecided → decision=NONE, never decision=''", () => {
    const p = buildApiParams({ ...defaultFilters(), decision: DECISION_FILTER_UNDECIDED });
    expect(p.decision).toBe('NONE');
    expect(p.decision).not.toBe('');
  });

  it('corrupted page / page_size (NaN, 0, negative, string garbage) degrade to 1 / 50 — never NaN', () => {
    for (const page of [NaN, 0, -1, 'abc', undefined, null] as unknown[]) {
      const p = buildApiParams({ ...defaultFilters(), page: page as number });
      expect(p.page).toBe(1);
    }
    for (const size of [NaN, 0, 'abc', undefined, null] as unknown[]) {
      const p = buildApiParams({ ...defaultFilters(), page_size: size as number });
      expect(p.page_size).toBe(50);
    }
    assertNoJunk(buildApiParams({ ...defaultFilters(), page: NaN, page_size: NaN }) as unknown as Record<string, unknown>);
  });

  it('hostile URL → hydrate → API params yields a valid request', () => {
    const f = hydrateFromQuery({
      page: 'abc', page_size: '99999', min_total: 'notanumber', synced: 'yes', decision: '', fy: [],
    });
    expect(buildApiParams(f)).toEqual({ page: 1, page_size: 50 });
  });
});

// ── hasActiveFilters ────────────────────────────────────────────────────────

describe('hasActiveFilters', () => {
  it('false for defaults and for paging-only changes', () => {
    expect(hasActiveFilters(defaultFilters())).toBe(false);
    expect(hasActiveFilters({ ...defaultFilters(), page: 5, page_size: 100 })).toBe(false);
  });

  it('true when any single filter is set', () => {
    for (const [k, v] of Object.entries({
      q: 'x', fy: 'FY26', synced: 'false', status: 'SKIPPED', to_process: 'true',
      decision: 'NONE', date_from: '2026-01-01', date_to: '2026-06-30',
    })) {
      expect(hasActiveFilters({ ...defaultFilters(), [k]: v }), k).toBe(true);
    }
  });
});
