/**
 * KTable.pagination.spec.ts
 *
 * Tests: page size, page navigation, last page boundary.
 * Strategy: exercise TanStack getPaginationRowModel() directly.
 */

import { describe, it, expect } from 'vitest';
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  createTable,
} from '@tanstack/vue-table';

interface Row {
  id: string;
  account_code: string;
  debit: number;
}

const columnHelper = createColumnHelper<Row>();
const columns = [
  columnHelper.accessor('account_code', { header: 'Code' }),
  columnHelper.accessor('debit', { header: 'Debit' }),
];

// Generate 100 rows for pagination tests
const bigData: Row[] = Array.from({ length: 100 }, (_, i) => ({
  id: String(i + 1),
  account_code: `ACC-${String(i + 1).padStart(3, '0')}`,
  debit: (i + 1) * 10,
}));

function makePaginatedTable(pageIndex: number, pageSize: number) {
  return createTable<Row>({
    data: bigData,
    columns,
    state: { pagination: { pageIndex, pageSize } },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: () => {},
  });
}

describe('KTable pagination logic', () => {
  it('page size 10: first page has 10 rows', () => {
    const table = makePaginatedTable(0, 10);
    expect(table.getPaginationRowModel().rows.length).toBe(10);
  });

  it('page size 25: first page has 25 rows', () => {
    const table = makePaginatedTable(0, 25);
    expect(table.getPaginationRowModel().rows.length).toBe(25);
  });

  it('page size 50: total page count is 2 for 100 rows', () => {
    const table = makePaginatedTable(0, 50);
    expect(table.getPageCount()).toBe(2);
  });

  it('navigating to page 2 (index 1) shows next 10 rows', () => {
    const table = makePaginatedTable(1, 10);
    const rows = table.getPaginationRowModel().rows;
    expect(rows.length).toBe(10);
    // Row index 10–19 → account_codes ACC-011 to ACC-020
    expect(rows[0].original.account_code).toBe('ACC-011');
    expect(rows[9].original.account_code).toBe('ACC-020');
  });

  it('last page: only remaining rows are shown', () => {
    // 100 rows, page size 30 → 4 pages: 30, 30, 30, 10
    const table = makePaginatedTable(3, 30);
    const rows = table.getPaginationRowModel().rows;
    expect(rows.length).toBe(10);
  });

  it('canPreviousPage is false on first page', () => {
    const table = makePaginatedTable(0, 10);
    expect(table.getCanPreviousPage()).toBe(false);
  });

  it('canNextPage is false on last page', () => {
    const table = makePaginatedTable(9, 10); // page 10/10 (index 9)
    expect(table.getCanNextPage()).toBe(false);
  });

  it('canPreviousPage is true on page 2+', () => {
    const table = makePaginatedTable(1, 10);
    expect(table.getCanPreviousPage()).toBe(true);
  });

  it('canNextPage is true on first page of multi-page set', () => {
    const table = makePaginatedTable(0, 10);
    expect(table.getCanNextPage()).toBe(true);
  });

  it('page size 100: single page — canNextPage is false, canPreviousPage is false', () => {
    const table = makePaginatedTable(0, 100);
    expect(table.getPageCount()).toBe(1);
    expect(table.getCanNextPage()).toBe(false);
    expect(table.getCanPreviousPage()).toBe(false);
  });
});
