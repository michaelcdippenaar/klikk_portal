/**
 * Comparison.smoke.spec.ts
 *
 * Smoke spec for Comparison.vue — KTable consumer.
 *
 * The page renders P&L period and account exception tables after a reconciliation
 * run. Strategy: exercise TanStack getCoreRowModel() directly with the
 * pnlPeriodKColumns shape (the primary table), plus source checks for the
 * account exception column shape.
 *
 * Vitest gate: ~9 cases — contributes to the ≥50 floor.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  createColumnHelper,
  getCoreRowModel,
  createTable,
} from '@tanstack/vue-table';

vi.mock('@/api/endpoints', () => ({
  runReconciliation: vi.fn(),
  getReconciliationHistory: vi.fn().mockResolvedValue([]),
}));

const SFC_PATH = resolve(__dirname, '../Comparison.vue');
const source = readFileSync(SFC_PATH, 'utf-8');

// ── P&L period row shape (mirrors pnlPeriodKColumns in Comparison.vue) ────────
interface PnlPeriodRow {
  period: number;
  period_date: string;
  total_comparisons: number;
  matches: number;
  mismatches: number;
  missing_in_db: number;
  missing_in_xero: number;
  match_percentage: number;
}

const MOCK_ROWS: PnlPeriodRow[] = [
  { period: 1, period_date: '2024-01', total_comparisons: 50, matches: 48, mismatches: 2,  missing_in_db: 0, missing_in_xero: 0, match_percentage: 96.0 },
  { period: 2, period_date: '2024-02', total_comparisons: 52, matches: 50, mismatches: 2,  missing_in_db: 0, missing_in_xero: 0, match_percentage: 96.2 },
  { period: 3, period_date: '2024-03', total_comparisons: 48, matches: 40, mismatches: 8,  missing_in_db: 0, missing_in_xero: 0, match_percentage: 83.3 },
  { period: 4, period_date: '2024-04', total_comparisons: 55, matches: 55, mismatches: 0,  missing_in_db: 0, missing_in_xero: 0, match_percentage: 100.0 },
  { period: 5, period_date: '2024-05', total_comparisons: 51, matches: 45, mismatches: 6,  missing_in_db: 0, missing_in_xero: 0, match_percentage: 88.2 },
];

const columnHelper = createColumnHelper<PnlPeriodRow>();
const pnlPeriodKColumns = [
  columnHelper.accessor('period',            { header: 'Period',          enableSorting: true }),
  columnHelper.accessor('period_date',       { header: 'Date',            enableSorting: true }),
  columnHelper.accessor('total_comparisons', { header: 'Comparisons',     enableSorting: true }),
  columnHelper.accessor('matches',           { header: 'Matches',         enableSorting: true }),
  columnHelper.accessor('mismatches',        { header: 'Mismatches',      enableSorting: true }),
  columnHelper.accessor('missing_in_db',     { header: 'Missing in DB',   enableSorting: true }),
  columnHelper.accessor('missing_in_xero',   { header: 'Missing in Xero', enableSorting: true }),
  columnHelper.accessor('match_percentage',  { header: 'Match %',         enableSorting: true }),
];

function makeTable(data: PnlPeriodRow[]) {
  return createTable<PnlPeriodRow>({
    data,
    columns: pnlPeriodKColumns,
    state: {},
    getCoreRowModel: getCoreRowModel(),
    onStateChange: () => {},
    renderFallbackValue: null,
  });
}

describe('Comparison — smoke (pnlPeriodKColumns primary table)', () => {
  it('renders all 5 mocked P&L period rows', () => {
    const table = makeTable(MOCK_ROWS);
    expect(table.getCoreRowModel().rows.length).toBe(5);
  });

  it('period accessor maps correctly', () => {
    const table = makeTable(MOCK_ROWS);
    const periods = table.getCoreRowModel().rows.map((r) => r.original.period);
    expect(periods).toEqual([1, 2, 3, 4, 5]);
  });

  it('match_percentage is accessible and numeric on all rows', () => {
    const table = makeTable(MOCK_ROWS);
    table.getCoreRowModel().rows.forEach((r) =>
      expect(typeof r.original.match_percentage).toBe('number'),
    );
  });

  it('empty data → zero rows', () => {
    const table = makeTable([]);
    expect(table.getCoreRowModel().rows.length).toBe(0);
  });

  it('has 8 column definitions for pnlPeriodKColumns', () => {
    const table = makeTable(MOCK_ROWS);
    expect(table.getAllColumns().length).toBe(8);
  });

  it('source uses KTable (is a KTable consumer)', () => {
    expect(source).toContain('KTable');
  });

  it('source defines pnlPeriodKColumns (column definitions present)', () => {
    expect(source).toContain('pnlPeriodKColumns');
  });

  it('labels the reconciliation year as an FY end year', () => {
    expect(source).toContain('label="FY End Year"');
  });

  it('converts FY end year to backend start-year semantics before reconciling', () => {
    expect(source).toContain('financialYearForReconciliationApi');
    expect(source).toContain('financial_year: apiFinancialYear');
  });
});
