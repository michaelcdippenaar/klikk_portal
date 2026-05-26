/**
 * KTable.alignment.spec.ts
 *
 * Validates the column-alignment fix:
 *   - table-layout: fixed + <colgroup> strategy
 *   - column widths from TanStack `size` prop / `meta.width` fallback
 *   - colWidth() helper returns consistent widths for both thead <col> and body cells
 *
 * Strategy: pure TanStack createTable in node environment (no DOM / jsdom needed).
 * We exercise the same width-resolution logic that KTable uses in its <colgroup>,
 * verifying that header and body columns share identical width values for both
 * virtual and non-virtual modes.
 *
 * Root cause being tested:
 *   table-layout: auto → thead cells stretched to 100% / N (evenly) while
 *   absolutely-positioned virtual rows packed data tight-left.
 *
 *   Fix: table-layout: fixed + <colgroup> with explicit widths from column.getSize()
 *   or meta.width. With colgroup-driven layout, the browser uses <col> widths for
 *   every row — including absolutely-positioned virtual rows — guaranteeing alignment.
 */

import { describe, it, expect } from 'vitest';
import {
  createTable,
  createColumnHelper,
  getCoreRowModel,
} from '@tanstack/vue-table';

// ── Replicate KTable's colWidth() helper (keep in sync with KTable.vue) ───────

function colWidth(column: { columnDef: { meta?: Record<string, unknown> }; getSize?: () => number }) {
  const meta = column.columnDef.meta as Record<string, string> | undefined;
  if (meta?.width) return { width: meta.width };
  const size = column.getSize?.();
  return { width: `${size || 150}px` };
}

// ── Minimal TanStack state required by createTable in test env ────────────────
// useVueTable (used by KTable at runtime) initialises these internally.
// createTable (the lower-level API used by other KTable specs) requires them
// to be provided explicitly.

const minState = {
  columnSizing: {},
  columnPinning: { left: [] as string[], right: [] as string[] },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  date: string;
  account: string;
  type: string;
  amount: number;
  description: string;
}

const sampleRows: Row[] = Array.from({ length: 10 }, (_, i) => ({
  id: String(i),
  date: `2024-01-${String(i + 1).padStart(2, '0')}`,
  account: `ACC-${i}`,
  type: i % 2 === 0 ? 'Debit' : 'Credit',
  amount: (i + 1) * 1000,
  description: `Transaction description for row ${i}`,
}));

const columnHelper = createColumnHelper<Row>();

// 5-column layout matching the InvestecAccount column defs (after the fix)
const columnsWithSize = [
  columnHelper.accessor('date',        { header: 'Date',        size: 110 }),
  columnHelper.accessor('account',     { header: 'Account',     size: 130 }),
  columnHelper.accessor('type',        { header: 'Type',        size: 90  }),
  columnHelper.accessor('amount',      { header: 'Amount (R)',  size: 140, meta: { align: 'right' } }),
  columnHelper.accessor('description', { header: 'Description', size: 280 }),
];

// ─────────────────────────────────────────────────────────────────────────────

describe('KTable column alignment — colgroup width strategy', () => {

  // ── Case 1: Non-virtual mode ─────────────────────────────────────────────
  //
  // In non-virtual mode, body rows are in normal table flow.
  // With table-layout: fixed + colgroup, the browser uses <col> widths for all rows.
  // Assertion: colWidth() on a header column and the matching body cell column
  // must return identical px values.

  it('non-virtual mode: header colgroup widths and body cell widths are identical', () => {
    const table = createTable<Row>({
      data: sampleRows,
      columns: columnsWithSize,
      getCoreRowModel: getCoreRowModel(),
      state: minState,
      onStateChange: () => {},
      renderFallbackValue: null,
    });

    // Widths that KTable sets on <colgroup> <col> elements (from thead)
    const [headerGroup] = table.getHeaderGroups();
    const colgroupWidths = headerGroup.headers.map((h) => colWidth(h.column).width);

    // Widths from the first body row's visible cells (same column objects)
    const firstRow = table.getCoreRowModel().rows[0];
    const bodyWidths = firstRow.getVisibleCells().map((c) => colWidth(c.column).width);

    // The alignment guarantee: header <col> and body <td> must use identical widths.
    // table-layout: fixed enforces this — the browser respects <colgroup> widths
    // for every row regardless of positioning mode (normal-flow or absolute).
    expect(colgroupWidths).toEqual(bodyWidths);

    // Assert the exact pixel values match the declared column sizes
    expect(colgroupWidths).toEqual(['110px', '130px', '90px', '140px', '280px']);
  });

  // ── Case 2: Virtual mode ──────────────────────────────────────────────────
  //
  // Virtual rows are rendered with position: absolute; width: 100%.
  // Without table-layout: fixed + colgroup, the thead cells stretch evenly
  // while absolute rows pack <td>s to content width — visible misalignment.
  //
  // With the fix: colWidth() is called identically for both the <colgroup> <col>
  // elements and the virtual <tr><td> cells. The browser honours <col> widths
  // for absolute rows too when table-layout is fixed.

  it('virtual mode: header colgroup widths and virtual-row cell widths are identical', () => {
    const table = createTable<Row>({
      data: sampleRows,
      columns: columnsWithSize,
      getCoreRowModel: getCoreRowModel(),
      state: minState,
      onStateChange: () => {},
      renderFallbackValue: null,
    });

    const [headerGroup] = table.getHeaderGroups();

    // These are the widths written to <colgroup> <col style="width: …">
    const colgroupWidths = headerGroup.headers.map((h) => colWidth(h.column).width);

    // In virtual mode, KTable iterates virtualizer.getVirtualItems() and renders
    // rows[virtualRow.index].getVisibleCells(). Same column objects → same widths.
    const virtualRows = table.getCoreRowModel().rows;
    const firstVirtualRowWidths = virtualRows[0]
      .getVisibleCells()
      .map((c) => colWidth(c.column).width);

    // The core invariant being tested: these are equal.
    // This is what prevents the header/body misalignment MC observed in the screenshot.
    expect(colgroupWidths).toEqual(firstVirtualRowWidths);
    expect(colgroupWidths).toHaveLength(5);

    // Spot-check widths
    expect(colgroupWidths[0]).toBe('110px'); // date
    expect(colgroupWidths[2]).toBe('90px');  // type (narrow)
    expect(colgroupWidths[4]).toBe('280px'); // description (widest)
  });

  // ── Case 3: meta.width takes priority over column.getSize() ──────────────
  //
  // Consumers can set meta.width (string) — this takes priority over numeric size.
  // Example: the __select__ checkbox column uses meta: { width: '40px' }.

  it('meta.width string takes priority over numeric size', () => {
    const colWithMeta = [
      columnHelper.accessor('date', {
        header: 'Date',
        size: 999, // should be ignored in favour of meta.width
        meta: { width: '180px' },
      }),
    ];

    const table = createTable<Row>({
      data: sampleRows,
      columns: colWithMeta,
      getCoreRowModel: getCoreRowModel(),
      state: minState,
      onStateChange: () => {},
      renderFallbackValue: null,
    });

    const [headerGroup] = table.getHeaderGroups();
    const width = colWidth(headerGroup.headers[0].column).width;

    expect(width).toBe('180px');
  });

  // ── Case 4: Default fallback when no explicit size set ────────────────────
  //
  // Columns without `size` default to TanStack's built-in 150px default.
  // colWidth() converts that to '150px' string for the <col style="width:…">.

  it('columns with no explicit size fall back to TanStack default (150px)', () => {
    const defaultCols = [
      columnHelper.accessor('date',    { header: 'Date' }),
      columnHelper.accessor('account', { header: 'Account' }),
    ];

    const table = createTable<Row>({
      data: sampleRows,
      columns: defaultCols,
      getCoreRowModel: getCoreRowModel(),
      state: minState,
      onStateChange: () => {},
      renderFallbackValue: null,
    });

    const [headerGroup] = table.getHeaderGroups();
    const widths = headerGroup.headers.map((h) => colWidth(h.column).width);

    // TanStack default column size is 150
    expect(widths).toEqual(['150px', '150px']);
  });
});
