/**
 * KTable.resize.spec.ts
 *
 * Gates for the opt-in drag-to-resize columns feature (`resizable` prop).
 *
 * STRATEGY (house pattern — see KTable.align.spec.ts): the Vitest environment
 * has no real layout engine, so we combine
 *
 *   A) Template gate (static source read) — the resizer handle exists, wires
 *      TanStack's getResizeHandler for mouse + touch, stops click propagation
 *      (so a drag never toggles sorting), and resets on double-click.
 *
 *   B) Config gate (static source read) — resizing is opt-in via the
 *      `resizable` prop, columnSizing is a controlled/emittable state, and the
 *      selection column opts out.
 *
 *   C) TanStack logic gate — a pure createTable instance proves the sizing
 *      pipeline KTable relies on: seeded sizes, sizing-state overrides via
 *      setColumnSizing, per-column enableResizing: false, and resetSize().
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  createTable,
  createColumnHelper,
  getCoreRowModel,
  type ColumnSizingState,
} from '@tanstack/vue-table';

const ROOT = new URL('../../../../', import.meta.url);

function readSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8');
}

const ktableVue = readSrc('src/components/klikk/KTable.vue');

// ── A: Template gate ─────────────────────────────────────────────────────────

describe('KTable resize — template wiring', () => {
  it('renders a resize handle gated on resizable + getCanResize()', () => {
    expect(ktableVue).toMatch(
      /v-if="resizable && header\.column\.getCanResize\(\)"/
    );
    expect(ktableVue).toContain('ktable-th__resizer');
  });

  it('wires TanStack getResizeHandler for both mouse and touch', () => {
    expect(ktableVue).toMatch(/@mousedown[^=]*="header\.getResizeHandler\(\)\(\$event\)"/);
    expect(ktableVue).toMatch(/@touchstart[^=]*="header\.getResizeHandler\(\)\(\$event\)"/);
  });

  it('stops click propagation so a drag never toggles sorting on the th', () => {
    // The handle sits inside a sortable <th> with a @click sort toggle.
    const resizerBlock = ktableVue.match(/ktable-th__resizer[\s\S]{0,600}?\/>/)?.[0] ?? '';
    expect(resizerBlock).toContain('@click.stop');
    expect(resizerBlock).toContain('@mousedown.stop');
  });

  it('double-click resets the column width', () => {
    expect(ktableVue).toMatch(/@dblclick\.stop="resetColumnSize\(header\.column\)"/);
    expect(ktableVue).toContain('column.resetSize()');
  });

  it('has hover/active styling and a col-resize cursor', () => {
    expect(ktableVue).toMatch(/\.ktable-th__resizer[\s\S]{0,300}cursor:\s*col-resize/);
    expect(ktableVue).toContain('ktable-th__resizer--active');
  });
});

// ── B: Config gate ───────────────────────────────────────────────────────────

describe('KTable resize — component configuration', () => {
  it('resizable is an opt-in prop (default false)', () => {
    expect(ktableVue).toMatch(/resizable:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\}/);
  });

  it('enableColumnResizing follows the prop; resize mode is onChange', () => {
    expect(ktableVue).toContain('enableColumnResizing: props.resizable');
    expect(ktableVue).toMatch(/columnResizeMode:\s*'onChange'/);
  });

  it('columnSizing is controlled state and emitted as update:columnSizing', () => {
    expect(ktableVue).toMatch(/get columnSizing\(\)\s*\{\s*return columnSizingState\.value;?\s*\}/);
    expect(ktableVue).toContain("'update:columnSizing'");
    expect(ktableVue).toContain("emit('update:columnSizing', next)");
  });

  it('the selection column opts out of resizing', () => {
    const selectColBlock = ktableVue.match(/const selectCol = \{[\s\S]{0,400}?\};/)?.[0] ?? '';
    expect(selectColBlock).toContain('enableResizing: false');
  });

  it('seeds TanStack size from meta.width so the first drag does not jump', () => {
    expect(ktableVue).toContain('parsePxWidth');
    expect(ktableVue).toMatch(/size:\s*c\.size\s*\?\?\s*parsePxWidth\(c\.meta\?\.width\)/);
  });

  it('a user-dragged width wins over meta.width in colWidth()', () => {
    const colWidthFn = ktableVue.match(/function colWidth\(column\) \{[\s\S]{0,600}?\n\}/)?.[0] ?? '';
    // The sizing-state check must come before the meta.width fallback.
    const stateIdx = colWidthFn.indexOf('columnSizingState');
    const metaIdx = colWidthFn.indexOf('meta?.width');
    expect(stateIdx).toBeGreaterThan(-1);
    expect(metaIdx).toBeGreaterThan(-1);
    expect(stateIdx).toBeLessThan(metaIdx);
  });
});

// ── C: TanStack sizing pipeline ──────────────────────────────────────────────

describe('KTable resize — TanStack sizing pipeline', () => {
  interface Row { id: string; ref: string; title: string }

  const colHelper = createColumnHelper<Row>();

  function makeTable() {
    let sizing: ColumnSizingState = {};
    const columns = [
      colHelper.accessor('ref', { header: 'Ref', size: 96 }),
      colHelper.accessor('title', { header: 'Title' }),
      colHelper.display({ id: 'actions', header: '', enableResizing: false, size: 108 }),
    ];
    const table = createTable<Row>({
      data: [{ id: '1', ref: 'F-1', title: 'Finding' }],
      columns,
      getCoreRowModel: getCoreRowModel(),
      enableColumnResizing: true,
      columnResizeMode: 'onChange',
      state: {
        get columnSizing() { return sizing; },
        columnPinning: { left: [], right: [] },
      },
      onColumnSizingChange: (updater) => {
        sizing = typeof updater === 'function' ? updater(sizing) : updater;
      },
      onStateChange: () => {},
      renderFallbackValue: null,
    });
    return { table, getSizing: () => sizing };
  }

  it('seeded size wins until the user resizes', () => {
    const { table } = makeTable();
    expect(table.getColumn('ref')!.getSize()).toBe(96);
  });

  it('setColumnSizing overrides the seeded size and lands in state', () => {
    const { table, getSizing } = makeTable();
    table.setColumnSizing({ ref: 240 });
    expect(getSizing()).toEqual({ ref: 240 });
    expect(table.getColumn('ref')!.getSize()).toBe(240);
  });

  it('enableResizing: false makes getCanResize() false for that column only', () => {
    const { table } = makeTable();
    expect(table.getColumn('actions')!.getCanResize()).toBe(false);
    expect(table.getColumn('ref')!.getCanResize()).toBe(true);
    expect(table.getColumn('title')!.getCanResize()).toBe(true);
  });

  it('resetSize() removes the override and falls back to the seeded size', () => {
    const { table, getSizing } = makeTable();
    table.setColumnSizing({ ref: 240 });
    table.getColumn('ref')!.resetSize();
    expect(getSizing().ref).toBeUndefined();
    expect(table.getColumn('ref')!.getSize()).toBe(96);
  });
});
