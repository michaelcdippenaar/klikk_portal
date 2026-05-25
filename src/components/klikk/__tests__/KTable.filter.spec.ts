/**
 * KTable.filter.spec.ts
 *
 * Tests: column filter narrows rows.
 * Strategy: exercise TanStack getFilteredRowModel() directly with column filters
 * state, confirming the filter narrows the visible row set correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  createTable,
} from '@tanstack/vue-table';

interface Row {
  id: string;
  account_code: string;
  account_name: string;
  type: string;
  debit: number;
  status: string;
}

const columnHelper = createColumnHelper<Row>();

const columns = [
  columnHelper.accessor('account_code', { header: 'Code', enableColumnFilter: true }),
  columnHelper.accessor('account_name', { header: 'Name', enableColumnFilter: true }),
  columnHelper.accessor('type', { header: 'Type', enableColumnFilter: true }),
  columnHelper.accessor('debit', { header: 'Debit', enableColumnFilter: true }),
  columnHelper.accessor('status', { header: 'Status', enableColumnFilter: true }),
];

const sampleData: Row[] = [
  { id: '1', account_code: 'A100', account_name: 'Accounts Receivable', type: 'Asset', debit: 1000, status: 'active' },
  { id: '2', account_code: 'B200', account_name: 'Bank', type: 'Asset', debit: 5000, status: 'active' },
  { id: '3', account_code: 'C300', account_name: 'Cost of Sales', type: 'Expense', debit: 2000, status: 'inactive' },
  { id: '4', account_code: 'D400', account_name: 'Debtors', type: 'Asset', debit: 750, status: 'active' },
  { id: '5', account_code: 'E500', account_name: 'Equity', type: 'Equity', debit: 0, status: 'active' },
];

function makeFilteredTable(columnFilters: { id: string; value: unknown }[]) {
  return createTable<Row>({
    data: sampleData,
    columns,
    state: { columnFilters },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: () => {},
  });
}

describe('KTable filter logic', () => {
  it('returns all rows when no filter is active', () => {
    const table = makeFilteredTable([]);
    expect(table.getFilteredRowModel().rows.length).toBe(5);
  });

  it('filters by account_code (string includes match)', () => {
    const table = makeFilteredTable([{ id: 'account_code', value: 'B' }]);
    const rows = table.getFilteredRowModel().rows;
    expect(rows.length).toBe(1);
    expect(rows[0].original.account_code).toBe('B200');
  });

  it('filters by account_name (case-insensitive substring)', () => {
    const table = makeFilteredTable([{ id: 'account_name', value: 'bank' }]);
    // TanStack default string filter is case-insensitive includesString
    const rows = table.getFilteredRowModel().rows;
    expect(rows.length).toBe(1);
    expect(rows[0].original.account_name).toBe('Bank');
  });

  it('filters by type to narrow to Asset rows only', () => {
    const table = makeFilteredTable([{ id: 'type', value: 'Asset' }]);
    const rows = table.getFilteredRowModel().rows;
    expect(rows.length).toBe(3);
    rows.forEach((r) => expect(r.original.type).toBe('Asset'));
  });

  it('filters by status = inactive returns 1 row', () => {
    const table = makeFilteredTable([{ id: 'status', value: 'inactive' }]);
    const rows = table.getFilteredRowModel().rows;
    expect(rows.length).toBe(1);
    expect(rows[0].original.status).toBe('inactive');
  });

  it('stacking two filters (AND) further narrows rows', () => {
    const table = makeFilteredTable([
      { id: 'type', value: 'Asset' },
      { id: 'account_name', value: 'Bank' },
    ]);
    const rows = table.getFilteredRowModel().rows;
    expect(rows.length).toBe(1);
    expect(rows[0].original.account_code).toBe('B200');
  });

  it('filter with no matches returns empty set', () => {
    const table = makeFilteredTable([{ id: 'account_code', value: 'ZZZ_NO_MATCH' }]);
    const rows = table.getFilteredRowModel().rows;
    expect(rows.length).toBe(0);
  });
});
