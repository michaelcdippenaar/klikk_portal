/**
 * KTable.sort.spec.ts
 *
 * Tests: sort by clicking a column header; shift-click for multi-sort.
 * Strategy: we test the TanStack table state directly via the sorting state
 * reactive ref, simulating what KTable does internally. This avoids the need
 * to mount the full component in a node environment that has no DOM.
 */

import { describe, it, expect } from 'vitest';
import { ref } from 'vue';

// Pure TanStack Table — no DOM required (getCoreRowModel etc. are pure functions)
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  createTable,
} from '@tanstack/vue-table';

interface Row {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

const columnHelper = createColumnHelper<Row>();

const columns = [
  columnHelper.accessor('account_code', { header: 'Code', enableSorting: true }),
  columnHelper.accessor('account_name', { header: 'Name', enableSorting: true }),
  columnHelper.accessor('debit', { header: 'Debit', enableSorting: true }),
];

const sampleData: Row[] = [
  { id: '1', account_code: 'B200', account_name: 'Bank', debit: 5000, credit: 0 },
  { id: '2', account_code: 'A100', account_name: 'Accounts Receivable', debit: 1000, credit: 0 },
  { id: '3', account_code: 'C300', account_name: 'Cash', debit: 3000, credit: 0 },
];

function makeTable(sorting: { id: string; desc: boolean }[]) {
  const sortingState = ref(sorting);
  const table = createTable<Row>({
    data: sampleData,
    columns,
    state: {
      sorting: sortingState.value,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      sortingState.value =
        typeof updater === 'function' ? updater(sortingState.value) : updater;
    },
  });
  return { table, sortingState };
}

describe('KTable sorting logic', () => {
  it('sorts a single column ascending by default', () => {
    const { table } = makeTable([{ id: 'account_code', desc: false }]);
    const rows = table.getSortedRowModel().rows;
    const codes = rows.map((r) => r.original.account_code);
    expect(codes).toEqual(['A100', 'B200', 'C300']);
  });

  it('sorts a single column descending', () => {
    const { table } = makeTable([{ id: 'account_code', desc: true }]);
    const rows = table.getSortedRowModel().rows;
    const codes = rows.map((r) => r.original.account_code);
    expect(codes).toEqual(['C300', 'B200', 'A100']);
  });

  it('sorts numerically on a number column', () => {
    const { table } = makeTable([{ id: 'debit', desc: false }]);
    const rows = table.getSortedRowModel().rows;
    const debits = rows.map((r) => r.original.debit);
    expect(debits).toEqual([1000, 3000, 5000]);
  });

  it('multi-sort: secondary sort breaks ties on primary sort', () => {
    const tiedData: Row[] = [
      { id: '1', account_code: 'A100', account_name: 'Zebra', debit: 100, credit: 0 },
      { id: '2', account_code: 'A100', account_name: 'Alpha', debit: 200, credit: 0 },
      { id: '3', account_code: 'B200', account_name: 'Middle', debit: 300, credit: 0 },
    ];

    const tiedTable = createTable<Row>({
      data: tiedData,
      columns,
      state: {
        sorting: [
          { id: 'account_code', desc: false },
          { id: 'account_name', desc: false },
        ],
      },
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      onSortingChange: () => {},
    });

    const rows = tiedTable.getSortedRowModel().rows;
    expect(rows[0].original.account_name).toBe('Alpha');
    expect(rows[1].original.account_name).toBe('Zebra');
    expect(rows[2].original.account_name).toBe('Middle');
  });

  it('toggleSorting cycles: none → asc → desc', () => {
    const { table, sortingState } = makeTable([]);

    // First toggle → ascending
    table.getColumn('account_code')!.toggleSorting(false);
    expect(sortingState.value).toEqual([{ id: 'account_code', desc: false }]);

    // Second toggle → descending
    table.getColumn('account_code')!.toggleSorting(true);
    expect(sortingState.value).toEqual([{ id: 'account_code', desc: true }]);
  });

  it('shift-click simulation: additive sort preserves existing sort state', () => {
    // Simulates: user has sorted by account_code asc, then shift-clicks debit
    const initialSorting = [{ id: 'account_code', desc: false }];
    const { table, sortingState } = makeTable(initialSorting);

    // Simulate shift-click by passing isMulti=true to toggleSorting
    table.getColumn('debit')!.toggleSorting(false, true);

    // Both columns should be in the sort state
    expect(sortingState.value.length).toBe(2);
    const ids = sortingState.value.map((s) => s.id);
    expect(ids).toContain('account_code');
    expect(ids).toContain('debit');
  });
});
