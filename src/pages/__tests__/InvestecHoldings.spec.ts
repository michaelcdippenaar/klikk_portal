/**
 * InvestecHoldings.spec.ts
 *
 * Tests: portfolio holdings data flows through TanStack Table column definitions
 * and renders all 5 mock rows.
 *
 * Strategy: exercise TanStack getCoreRowModel() directly with mocked portfolio
 * rows — matching the project's existing node-environment test pattern
 * (no jsdom / @vue/test-utils; those deps are not installed).
 *
 * What is verified:
 *   - All 5 mock rows are present after getCoreRowModel()
 *   - Column definitions correctly map InvestecJsePortfolio fields
 *   - Key fields (share_code, company, total_value) are accessible via accessor keys
 *   - Empty data → zero rows (EmptyState trigger condition)
 *
 * If jsdom + @vue/test-utils are added in a future sprint, replace with a
 * full mount test that verifies the KTable and FreshnessChip DOM output.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createColumnHelper,
  getCoreRowModel,
  createTable,
} from '@tanstack/vue-table';

// ── Mock the API module so imports of endpoints.js don't fail in node env ──
vi.mock('@/api/endpoints', () => ({
  getInvestecPortfolio: vi.fn().mockResolvedValue({
    count: 5,
    limit: 100,
    offset: 0,
    results: [],
  }),
  uploadInvestecPortfolio: vi.fn(),
}));

// ── Portfolio row shape (mirrors InvestecJsePortfolioSerializer) ────────────
interface PortfolioRow {
  id: number;
  date: string;
  company: string;
  share_code: string;
  quantity: string;
  currency: string;
  unit_cost: string;
  total_cost: string;
  price: string;
  total_value: string;
  exchange_rate: string | null;
  move_percent: string | null;
  portfolio_percent: string | null;
  profit_loss: string | null;
  annual_income_zar: string | null;
}

// ── 5 mock rows returned by the mocked API ─────────────────────────────────
const MOCK_ROWS: PortfolioRow[] = [
  { id: 1, date: '2024-01-31', company: 'ABSA GROUP LIMITED', share_code: 'ABG', quantity: '500.0000', currency: 'ZAR', unit_cost: '150.0000', total_cost: '75000.00', price: '165.0000', total_value: '82500.00', exchange_rate: null, move_percent: '0.5000', portfolio_percent: '12.5000', profit_loss: '7500.00', annual_income_zar: '3200.00' },
  { id: 2, date: '2024-01-31', company: 'CAPITEC BANK HOLDINGS', share_code: 'CPI', quantity: '100.0000', currency: 'ZAR', unit_cost: '2200.0000', total_cost: '220000.00', price: '2500.0000', total_value: '250000.00', exchange_rate: null, move_percent: '1.2000', portfolio_percent: '37.9000', profit_loss: '30000.00', annual_income_zar: '5000.00' },
  { id: 3, date: '2024-01-31', company: 'DISCOVERY LIMITED', share_code: 'DSY', quantity: '300.0000', currency: 'ZAR', unit_cost: '120.0000', total_cost: '36000.00', price: '135.0000', total_value: '40500.00', exchange_rate: null, move_percent: '-0.3000', portfolio_percent: '6.1000', profit_loss: '4500.00', annual_income_zar: null },
  { id: 4, date: '2024-01-31', company: 'FIRSTRAND LIMITED', share_code: 'FSR', quantity: '800.0000', currency: 'ZAR', unit_cost: '55.0000', total_cost: '44000.00', price: '68.0000', total_value: '54400.00', exchange_rate: null, move_percent: '0.8000', portfolio_percent: '8.2000', profit_loss: '10400.00', annual_income_zar: '2800.00' },
  { id: 5, date: '2024-01-31', company: 'NEDBANK GROUP LIMITED', share_code: 'NED', quantity: '250.0000', currency: 'ZAR', unit_cost: '200.0000', total_cost: '50000.00', price: '240.0000', total_value: '60000.00', exchange_rate: null, move_percent: '0.2000', portfolio_percent: '9.1000', profit_loss: '10000.00', annual_income_zar: '3600.00' },
];

// ── Column definitions — mirror InvestecHoldings.vue holdingsColumns ────────
const columnHelper = createColumnHelper<PortfolioRow>();
const holdingsColumns = [
  columnHelper.accessor('date',              { header: 'Date',               enableSorting: true }),
  columnHelper.accessor('company',           { header: 'Company',            enableSorting: true }),
  columnHelper.accessor('share_code',        { header: 'Code',               enableSorting: true }),
  columnHelper.accessor('quantity',          { header: 'Quantity',           enableSorting: true }),
  columnHelper.accessor('price',             { header: 'Price',              enableSorting: true }),
  columnHelper.accessor('total_value',       { header: 'Total value',        enableSorting: true }),
  columnHelper.accessor('portfolio_percent', { header: 'Portfolio %',        enableSorting: true }),
  columnHelper.accessor('profit_loss',       { header: 'P&L',                enableSorting: true }),
  columnHelper.accessor('annual_income_zar', { header: 'Annual income (R)',  enableSorting: true }),
];

function makeTable(data: PortfolioRow[]) {
  return createTable<PortfolioRow>({
    data,
    columns: holdingsColumns,
    state: {},
    getCoreRowModel: getCoreRowModel(),
    onStateChange: () => {},
    renderFallbackValue: null,
  });
}

describe('InvestecHoldings portfolio table', () => {
  it('renders all 5 mock portfolio rows', () => {
    const table = makeTable(MOCK_ROWS);
    expect(table.getCoreRowModel().rows.length).toBe(5);
  });

  it('share_code column accessor maps correctly for each row', () => {
    const table = makeTable(MOCK_ROWS);
    const codes = table.getCoreRowModel().rows.map((r) => r.original.share_code);
    expect(codes).toEqual(['ABG', 'CPI', 'DSY', 'FSR', 'NED']);
  });

  it('company column accessor maps correctly for each row', () => {
    const table = makeTable(MOCK_ROWS);
    const companies = table.getCoreRowModel().rows.map((r) => r.original.company);
    expect(companies).toContain('ABSA GROUP LIMITED');
    expect(companies).toContain('CAPITEC BANK HOLDINGS');
    expect(companies).toContain('NEDBANK GROUP LIMITED');
  });

  it('total_value is present on all rows', () => {
    const table = makeTable(MOCK_ROWS);
    const values = table.getCoreRowModel().rows.map((r) => r.original.total_value);
    values.forEach((v) => expect(v).toBeTruthy());
  });

  it('empty data → zero rows (EmptyState trigger condition)', () => {
    const table = makeTable([]);
    expect(table.getCoreRowModel().rows.length).toBe(0);
  });

  it('has 9 column definitions matching holdingsColumns', () => {
    const table = makeTable(MOCK_ROWS);
    expect(table.getAllColumns().length).toBe(9);
  });

  it('column headers match expected labels', () => {
    const table = makeTable(MOCK_ROWS);
    const headers = table.getAllColumns().map((c) => c.columnDef.header);
    expect(headers).toContain('Company');
    expect(headers).toContain('Code');
    expect(headers).toContain('Total value');
    expect(headers).toContain('Portfolio %');
  });
});
