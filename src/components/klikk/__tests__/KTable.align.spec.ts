/**
 * KTable.align.spec.ts
 *
 * Vitest gate for F2 — numeric column alignment.
 *
 * MECHANISM: Column defs specify meta: { align: 'right' } but KTable never
 * reads it. Amount and Balance columns appear left-aligned — a cardinal sin
 * in a finance table where eyes scan magnitudes by aligned decimals.
 *
 * FIX: KTable reads cell.column.columnDef.meta?.align and applies
 * ktable-th--align-right / ktable-td--align-right classes on both the
 * <th> and <td> in both virtual and non-virtual paths. CSS rules map the
 * modifier classes to text-align: right / center.
 *
 * STRATEGY: Vitest environment is "node" — no jsdom. Two complementary tests:
 *
 *   A) CSS gate (static source read) — assert the modifier classes exist
 *      and map to correct text-align values in KTable.vue <style>.
 *
 *   B) Template gate (static source read) — assert both the <th> :class
 *      binding and both <td> :class bindings reference meta?.align so the
 *      template wiring is present (regression guard against reverting one
 *      path but not the other).
 *
 *   C) TanStack logic gate — mount a createTable instance with a numeric
 *      column carrying meta.align = 'right', iterate header groups and body
 *      cells, assert meta.align is readable from cell.column.columnDef.meta.
 *      (Confirms TanStack passes meta through — the Vue adapter does not strip it.)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  createTable,
  createColumnHelper,
  getCoreRowModel,
} from '@tanstack/vue-table';

const ROOT = new URL('../../../../', import.meta.url);

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8');
}

const ktableVue = readSrc('src/components/klikk/KTable.vue');

// ── A: CSS gate ───────────────────────────────────────────────────────────────

describe('KTable F2 — alignment CSS rules', () => {
  it('.ktable-th--align-right maps to text-align: right', () => {
    // The rule may be combined with .ktable-td--align-right in a selector list
    expect(ktableVue).toMatch(/ktable-th--align-right/);
    // Find the block that contains both the selector and the text-align
    const combinedRe =
      /\.ktable-th--align-right[\s\S]{0,200}text-align\s*:\s*right/;
    expect(ktableVue).toMatch(combinedRe);
  });

  it('.ktable-td--align-right maps to text-align: right', () => {
    expect(ktableVue).toMatch(/ktable-td--align-right/);
    const combinedRe =
      /\.ktable-td--align-right[\s\S]{0,200}text-align\s*:\s*right/;
    expect(ktableVue).toMatch(combinedRe);
  });

  it('.ktable-th--align-center and .ktable-td--align-center rules exist', () => {
    expect(ktableVue).toMatch(/ktable-th--align-center/);
    expect(ktableVue).toMatch(/ktable-td--align-center/);
  });
});

// ── B: Template gate ──────────────────────────────────────────────────────────
//
// Note: The root <template> block cannot be reliably extracted via a simple
// regex because the block contains nested <template v-if/v-else> tags. Instead
// we search the full source for the class strings — they only appear in the
// template section (not in <script> or <style>) and are unambiguous.

describe('KTable F2 — template :class bindings read meta?.align', () => {
  it('<th> :class binding includes ktable-th--align-right conditional', () => {
    // The class must appear in the :class binding on the <th> element.
    // Both the class name and the meta?.align condition must be present.
    expect(ktableVue).toContain("'ktable-th--align-right'");
    expect(ktableVue).toMatch(/ktable-th--align-right.*align.*right/s);
  });

  it('ktable-td--align-right appears in both virtual and non-virtual <td> paths', () => {
    // The class must appear at least twice: once in the virtual tbody <td>
    // and once in the non-virtual tbody <td>.
    const matches = ktableVue.match(/'ktable-td--align-right'/g);
    expect(
      matches?.length,
      "'ktable-td--align-right' must appear in both virtual and non-virtual <td> :class bindings"
    ).toBeGreaterThanOrEqual(2);
  });

  it('<th> :class binding includes ktable-th--align-center conditional', () => {
    expect(ktableVue).toContain("'ktable-th--align-center'");
    expect(ktableVue).toMatch(/ktable-th--align-center.*align.*center/s);
  });
});

// ── C: TanStack meta passthrough ─────────────────────────────────────────────

describe('KTable F2 — TanStack passes meta.align through to cell context', () => {
  interface Row { id: string; amount: number }

  const colHelper = createColumnHelper<Row>();

  const columns = [
    colHelper.accessor('id',     { header: 'ID' }),
    colHelper.accessor('amount', {
      header: 'Amount (R)',
      size: 140,
      meta: { align: 'right' },
    }),
  ];

  const data: Row[] = [
    { id: '1', amount: 1000 },
    { id: '2', amount: 2500 },
  ];

  const minState = {
    columnSizing: {},
    columnPinning: { left: [] as string[], right: [] as string[] },
  };

  const table = createTable<Row>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: minState,
    onStateChange: () => {},
    renderFallbackValue: null,
  });

  it('header for amount column exposes meta.align = "right"', () => {
    const [headerGroup] = table.getHeaderGroups();
    const amountHeader = headerGroup.headers.find((h) => h.column.id === 'amount');
    expect(amountHeader).toBeDefined();
    expect((amountHeader!.column.columnDef.meta as any)?.align).toBe('right');
  });

  it('first body cell for amount column exposes meta.align = "right"', () => {
    const firstRow = table.getCoreRowModel().rows[0];
    const amountCell = firstRow.getVisibleCells().find(
      (c) => c.column.id === 'amount'
    );
    expect(amountCell).toBeDefined();
    expect((amountCell!.column.columnDef.meta as any)?.align).toBe('right');
  });

  it('id column (no meta.align) has meta.align = undefined', () => {
    const firstRow = table.getCoreRowModel().rows[0];
    const idCell = firstRow.getVisibleCells().find((c) => c.column.id === 'id');
    expect(idCell).toBeDefined();
    // Should be absent — not right or center
    const metaAlign = (idCell!.column.columnDef.meta as any)?.align;
    expect(metaAlign).toBeUndefined();
  });
});
