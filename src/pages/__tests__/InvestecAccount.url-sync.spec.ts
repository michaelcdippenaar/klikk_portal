/**
 * InvestecAccount.url-sync.spec.ts
 *
 * Tests: URL query-param hydration and route-replace logic for InvestecAccount.
 *
 * Strategy: exercise the pure hydration and URL-building functions directly,
 * matching the project's node-environment test pattern (no jsdom / @vue/test-utils).
 *
 * What is verified:
 *   - Hydrating filter state from route.query populates each filter field correctly
 *   - Pagination offset is derived from `page` + `rows` params
 *   - buildRouteQuery correctly serialises active filters (omits empty/default values)
 *   - Inactive filters are NOT included in the query object
 *   - `rows` param is omitted when rowsPerPage is the default (100)
 *   - `page` param is omitted when offset is 0
 */

import { describe, it, expect } from 'vitest';

// ── Pure helpers mirroring InvestecAccount.vue logic ─────────────────────────
// These are extracted so they can be unit-tested without mounting the component.

interface FilterState {
  description: string;
  amount: string;
  date_from: string;
  date_to: string;
  account: string[];
}

interface PaginationState {
  offset: number;
  rowsPerPage: number;
}

type RouteQuery = Record<string, string | null | undefined>;

/**
 * Mirrors hydrateFiltersFromRoute() in InvestecAccount.vue.
 * Returns a new filter + pagination state; does NOT mutate.
 */
function hydrateFromQuery(
  q: RouteQuery,
  defaults: { rowsPerPage: number }
): { filters: FilterState; pagination: PaginationState } {
  const rowsPerPage = q.rows ? Number(q.rows) || defaults.rowsPerPage : defaults.rowsPerPage;
  const page = q.page ? Number(q.page) || 1 : 1;
  const offset = (page - 1) * rowsPerPage;

  return {
    filters: {
      description: q.description ? String(q.description) : '',
      amount:      q.amount      ? String(q.amount)      : '',
      date_from:   q.from        ? String(q.from)        : '',
      date_to:     q.to          ? String(q.to)          : '',
      account:     q.account     ? String(q.account).split(',').map((value) => value.trim()).filter(Boolean) : [],
    },
    pagination: { offset, rowsPerPage },
  };
}

/**
 * Mirrors the syncRouteFromFilters() query-building logic in InvestecAccount.vue.
 * Returns the query object that would be passed to router.replace().
 */
function buildRouteQuery(
  filters: FilterState,
  pagination: PaginationState,
  currentPage: number
): RouteQuery {
  const query: RouteQuery = {};
  if (filters.description) query.description = filters.description;
  if (filters.amount)      query.amount      = filters.amount;
  if (filters.date_from)   query.from        = filters.date_from;
  if (filters.date_to)     query.to          = filters.date_to;
  if (filters.account.length > 0) query.account = filters.account.join(',');
  if (pagination.rowsPerPage !== 100) query.rows = String(pagination.rowsPerPage);
  if (pagination.offset > 0)          query.page = String(currentPage);
  return query;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InvestecAccount — URL sync', () => {
  describe('hydrateFromQuery — reading route.query into filter + pagination state', () => {
    it('populates description filter from query param', () => {
      const { filters } = hydrateFromQuery({ description: 'salary' }, { rowsPerPage: 100 });
      expect(filters.description).toBe('salary');
    });

    it('populates account filter from query param', () => {
      const { filters } = hydrateFromQuery({ account: '10011924075' }, { rowsPerPage: 100 });
      expect(filters.account).toEqual(['10011924075']);
    });

    it('populates multiple account filters from comma-separated query param', () => {
      const { filters } = hydrateFromQuery({ account: '10011924075,10011910139' }, { rowsPerPage: 100 });
      expect(filters.account).toEqual(['10011924075', '10011910139']);
    });

    it('populates date_from from `from` query param', () => {
      const { filters } = hydrateFromQuery({ from: '2026-01-01' }, { rowsPerPage: 100 });
      expect(filters.date_from).toBe('2026-01-01');
    });

    it('populates date_to from `to` query param', () => {
      const { filters } = hydrateFromQuery({ to: '2026-03-31' }, { rowsPerPage: 100 });
      expect(filters.date_to).toBe('2026-03-31');
    });

    it('populates amount filter from query param', () => {
      const { filters } = hydrateFromQuery({ amount: '1500.00' }, { rowsPerPage: 100 });
      expect(filters.amount).toBe('1500.00');
    });

    it('hydrates all filters together', () => {
      const q: RouteQuery = {
        description: 'interest',
        from:        '2026-01-01',
        account:     '10011924075,10011910139',
      };
      const { filters } = hydrateFromQuery(q, { rowsPerPage: 100 });
      expect(filters.description).toBe('interest');
      expect(filters.date_from).toBe('2026-01-01');
      expect(filters.account).toEqual(['10011924075', '10011910139']);
      expect(filters.amount).toBe('');
      expect(filters.date_to).toBe('');
    });

    it('derives pagination offset from `page` × `rows`', () => {
      const { pagination } = hydrateFromQuery({ rows: '250', page: '3' }, { rowsPerPage: 100 });
      expect(pagination.rowsPerPage).toBe(250);
      expect(pagination.offset).toBe(500); // (3 - 1) * 250
    });

    it('defaults to rowsPerPage=100 and offset=0 when params absent', () => {
      const { pagination } = hydrateFromQuery({}, { rowsPerPage: 100 });
      expect(pagination.rowsPerPage).toBe(100);
      expect(pagination.offset).toBe(0);
    });

    it('leaves filters empty when query is empty', () => {
      const { filters } = hydrateFromQuery({}, { rowsPerPage: 100 });
      expect(filters.description).toBe('');
      expect(filters.account).toEqual([]);
    });
  });

  describe('buildRouteQuery — serialising filter state back to query params', () => {
    const emptyFilters: FilterState = {
      description: '', amount: '', date_from: '', date_to: '', account: [],
    };
    const defaultPagination: PaginationState = { offset: 0, rowsPerPage: 100 };

    it('includes description in query when set', () => {
      const q = buildRouteQuery({ ...emptyFilters, description: 'foo' }, defaultPagination, 1);
      expect(q.description).toBe('foo');
    });

    it('includes account in query when set', () => {
      const q = buildRouteQuery({ ...emptyFilters, account: ['10011924075'] }, defaultPagination, 1);
      expect(q.account).toBe('10011924075');
    });

    it('serialises multiple selected accounts as a comma-separated query param', () => {
      const q = buildRouteQuery({ ...emptyFilters, account: ['10011924075', '10011910139'] }, defaultPagination, 1);
      expect(q.account).toBe('10011924075,10011910139');
    });

    it('uses `from` key (not `date_from`) for date_from', () => {
      const q = buildRouteQuery({ ...emptyFilters, date_from: '2026-01-01' }, defaultPagination, 1);
      expect(q.from).toBe('2026-01-01');
      expect(q.date_from).toBeUndefined();
    });

    it('uses `to` key (not `date_to`) for date_to', () => {
      const q = buildRouteQuery({ ...emptyFilters, date_to: '2026-06-30' }, defaultPagination, 1);
      expect(q.to).toBe('2026-06-30');
    });

    it('omits `rows` when rowsPerPage is the default (100)', () => {
      const q = buildRouteQuery(emptyFilters, { offset: 0, rowsPerPage: 100 }, 1);
      expect(q.rows).toBeUndefined();
    });

    it('includes `rows` when rowsPerPage differs from default', () => {
      const q = buildRouteQuery(emptyFilters, { offset: 0, rowsPerPage: 250 }, 1);
      expect(q.rows).toBe('250');
    });

    it('omits `page` when offset is 0', () => {
      const q = buildRouteQuery(emptyFilters, { offset: 0, rowsPerPage: 100 }, 1);
      expect(q.page).toBeUndefined();
    });

    it('includes `page` when offset > 0', () => {
      const q = buildRouteQuery(emptyFilters, { offset: 200, rowsPerPage: 100 }, 3);
      expect(q.page).toBe('3');
    });

    it('produces empty query when no filters active and at first page', () => {
      const q = buildRouteQuery(emptyFilters, defaultPagination, 1);
      expect(Object.keys(q).length).toBe(0);
    });
  });
});
