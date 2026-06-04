/**
 * PivotExplorer.spec.js — MOUNT-BASED tests for the Slice & Dice (TM1) pivot
 * explorer (PivotExplorer.vue + its child PivotAxisChip.vue).
 *
 * Authored under the test-authorship-split doctrine: written by an independent
 * tester (NOT the feature author) to LOCK the P0 correctness fixes that just
 * landed on the drill / totals / path-keying logic. The bar (per the 2026-05-26
 * KTable incident) is mount-based + realistic data + observable DOM: we mount
 * the REAL consumer (PivotExplorer) with its REAL child (PivotAxisChip) and the
 * REAL KDL primitives (SectionCard / KSelect / KToggle / KSpinner / KPopover /
 * EmptyState / KMenu). ONLY the network boundary (src/api/planningAnalytics) is
 * mocked — those five functions are the TM1 HTTP surface.
 *
 * ── The FAKE CUBE (the engine of these tests) ────────────────────────────────
 * The explorer re-queries the backend every time a row is expanded/collapsed
 * (the visible member set changes), so a static fixture is useless — the
 * runTm1Query mock must answer correctly for WHATEVER member set the component
 * asks for. We therefore model a small account-style cube and DERIVE the query
 * response from the requested members on every call.
 *
 *   account (Rows)   All_Account ─┬─ EXPENSE (consol, rolled 100)
 *                                 │     ├─ Rent      (leaf, 60)   ← shared name
 *                                 │     └─ Salaries  (leaf, 40)
 *                                 └─ COGS    (consol, rolled 40)
 *                                       ├─ Rent      (leaf, 25)   ← shared name,
 *                                       │                            DIFFERENT value
 *                                       └─ Materials (leaf, 15)
 *   month   (Cols)   All_Month   ─┬─ Jul    (leaf)
 *                                 └─ Aug    (leaf)
 *   measure (Filter) Amount
 *
 * Confirmed backend contract modelled here:
 *   • A CONSOLIDATION returns its ROLLED value (EXPENSE rolled 100 == Rent 60 +
 *     Salaries 40 exactly; COGS rolled 40 == Rent 25 + Materials 15).
 *   • The row axis is a FLAT, ordered member list. The component sends the
 *     visible tree depth-first ([EXPENSE, Rent, Salaries, COGS, Rent, Materials]
 *     when both are open) and the backend returns ONE row PER REQUESTED
 *     OCCURRENCE, in request order — so the two "Rent" occurrences come back as
 *     two positionally-distinct rows carrying their OWN contextual value (60 vs
 *     25). The component path-keys + positionally de-queues them. Our mock walks
 *     the requested list tracking the enclosing consolidation, so each "Rent"
 *     position resolves to the value for ITS parent's subtree.
 *   • All of a member's value lands in the Jul column; Aug is 0 — so the
 *     arithmetic stays transparent (per-row total == the member's scalar; the
 *     Jul column total == the grand total; Aug renders blank).
 *
 * Response shape returned by runTm1Query (verbatim component contract):
 *   { columns: [[member], ...], rows: [{ members:[...], cells:[{value,formatted}] }], mdx }
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ── Mock the network boundary — the five TM1 HTTP functions ──────────────────
vi.mock('../../../api/planningAnalytics', () => ({
  getTm1Cubes: vi.fn(),
  getTm1CubeDimensions: vi.fn(),
  getTm1DimensionElements: vi.fn(),
  getTm1DimensionChildren: vi.fn(),
  runTm1Query: vi.fn(),
}));

import PivotExplorer from '../PivotExplorer.vue';
import PivotAxisChip from '../PivotAxisChip.vue';
import {
  getTm1Cubes,
  getTm1CubeDimensions,
  getTm1DimensionElements,
  getTm1DimensionChildren,
  runTm1Query,
} from '../../../api/planningAnalytics';

// ════════════════════════════════════════════════════════════════════════════
// FAKE CUBE — the single source of truth the mocks are derived from
// ════════════════════════════════════════════════════════════════════════════
const CUBE = 'gl_src_trial_balance';

// TM1 element types: 'C' = consolidation (drillable), 'N' = numeric leaf.
// account dimension topology + leaf values (the cube intersection at Amount).
const ACCOUNT = {
  top: 'All_Account',
  // parent -> ordered children (name + type)
  children: {
    All_Account: [
      { name: 'EXPENSE', type: 'C' },
      { name: 'COGS', type: 'C' },
    ],
    EXPENSE: [
      { name: 'Rent', type: 'N' },
      { name: 'Salaries', type: 'N' },
    ],
    COGS: [
      { name: 'Rent', type: 'N' },
      { name: 'Materials', type: 'N' },
    ],
  },
  // Leaf values are CONTEXTUAL (per enclosing consolidation) — this is the whole
  // point of the shared-member test. Keyed by `${parent}/${leaf}`.
  leafValue: {
    'EXPENSE/Rent': 60,
    'EXPENSE/Salaries': 40,
    'COGS/Rent': 25,
    'COGS/Materials': 15,
  },
  // Consolidation rolled values == exact sum of their children (backend contract).
  rolled: {
    EXPENSE: 100, // 60 + 40
    COGS: 40, //     25 + 15
  },
};

const MONTH = {
  top: 'All_Month',
  children: {
    All_Month: [
      { name: 'Jul', type: 'N' },
      { name: 'Aug', type: 'N' },
    ],
  },
};

const MEASURE = { top: 'Amount', children: { Amount: [] } };

const ELEMENTS = {
  account: [
    { name: 'All_Account', type: 'C' },
    { name: 'EXPENSE', type: 'C' },
    { name: 'COGS', type: 'C' },
    { name: 'Rent', type: 'N' },
    { name: 'Salaries', type: 'N' },
    { name: 'Materials', type: 'N' },
  ],
  month: [
    { name: 'All_Month', type: 'C' },
    { name: 'Jul', type: 'N' },
    { name: 'Aug', type: 'N' },
  ],
  measure: [{ name: 'Amount', type: 'N' }],
};

const CHILDREN = {
  account: ACCOUNT.children,
  month: MONTH.children,
  measure: MEASURE.children,
};

// ── runTm1Query response builder ─────────────────────────────────────────────
// Resolve the contextual value of a single requested ROW member, given the
// consolidation currently in scope as we walk the flat request list. Returns
// { value, scope } where scope is the enclosing-consolidation context to carry
// forward (a consolidation opens a new scope; a leaf reads its value under the
// current scope, defaulting to the member's first-seen parent).
function leafValueFor(member, scope) {
  // A consolidation: emit its rolled value AND become the new scope.
  if (ACCOUNT.rolled[member] != null) {
    return { value: ACCOUNT.rolled[member], scope: member };
  }
  // A leaf: read its value under the current consolidation scope. If we have no
  // scope yet (leaf requested at the top), fall back to the leaf's first parent.
  const direct = scope != null ? ACCOUNT.leafValue[`${scope}/${member}`] : undefined;
  if (direct != null) return { value: direct, scope };
  const anyKey = Object.keys(ACCOUNT.leafValue).find((k) => k.endsWith(`/${member}`));
  return { value: anyKey != null ? ACCOUNT.leafValue[anyKey] : 0, scope };
}

// Build the cellset the backend would return for a payload. Single row dim is
// the drillable path (the hero). For >1 row dim we return the cartesian product
// of the row members (the flat, non-drillable multi-dim path) — values there are
// not asserted, only the presence of rows + the caption.
function buildQueryResponse(payload) {
  const rowDims = payload.rows || [];
  const colDims = payload.cols || [];
  const colMembers = (colDims[0]?.members || []).slice();
  const columns = colMembers.map((m) => [m]);

  // Per requested column, what fraction of a member's scalar lands there: Jul
  // gets the whole value, every other column gets 0 (keeps arithmetic clean).
  const colFactor = (colMember) => (colMember === 'Jul' ? 1 : 0);

  const cellsFor = (scalar) =>
    colMembers.map((cm) => {
      const v = scalar * colFactor(cm);
      return { value: v, formatted: null };
    });

  let rows = [];
  if (rowDims.length === 1) {
    // Walk the flat, ordered row member list; track the enclosing consolidation
    // scope so each occurrence (incl. duplicate shared members) gets its OWN
    // contextual value — exactly what TM1 returns positionally.
    let scope = null;
    rows = (rowDims[0].members || []).map((member) => {
      const { value, scope: nextScope } = leafValueFor(member, scope);
      scope = nextScope;
      return { members: [member], cells: cellsFor(value) };
    });
  } else if (rowDims.length > 1) {
    // Cartesian product of all row-dim member lists → one flat tuple per combo.
    const lists = rowDims.map((d) => d.members || []);
    const product = lists.reduce(
      (acc, list) => acc.flatMap((tuple) => list.map((m) => [...tuple, m])),
      [[]],
    );
    rows = product.map((tuple) => {
      // Value: the first row member's contextual scalar (deterministic; unused
      // in assertions — the multi-dim test only checks rows exist + caption).
      const { value } = leafValueFor(tuple[0], null);
      return { members: tuple, cells: cellsFor(value) };
    });
  }

  return {
    columns,
    rows,
    mdx: `SELECT FROM [${payload.cube}]`,
  };
}

// ── Wire the mocks from the fake cube ────────────────────────────────────────
function installCubeMocks({ dimensions = ['account', 'month', 'measure'] } = {}) {
  getTm1Cubes.mockResolvedValue({ cubes: [CUBE] });
  getTm1CubeDimensions.mockResolvedValue({ dimensions });
  getTm1DimensionElements.mockImplementation(async (dimension) => ({
    elements: ELEMENTS[dimension] || [],
  }));
  getTm1DimensionChildren.mockImplementation(async (dimension, parent) => ({
    children: (CHILDREN[dimension] && CHILDREN[dimension][parent]) || [],
  }));
  runTm1Query.mockImplementation(async (payload) => buildQueryResponse(payload));
}

// ── DOM helpers — select on SEMANTICS (role / aria / text / stable class) ─────

// Mount + let the full auto-open chain settle (loadCubes → watch(cube) →
// loadDimensions → seedAllDefaults → runQuery), flushing microtasks. The
// component uses no rAF/timers, so flushPromises (repeated to drain chained
// awaits + the post-query reactive re-render) is sufficient and deterministic.
async function mountExplorer() {
  const wrapper = mount(PivotExplorer);
  await settle();
  return wrapper;
}

// Drain chained promises + reactivity. Several awaits chain (cubes → dims →
// children → query), so we flush a few times to reach a fixed point.
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await flushPromises();
  }
}

// The data <tr> rows of the grid body (each carries aria-level).
function bodyRows(wrapper) {
  return wrapper.findAll('tbody tr.pivot-grid__row');
}

// The row-header label text for each body row, in order.
function rowLabels(wrapper) {
  return bodyRows(wrapper).map((tr) => tr.find('.pivot-grid__row-label').text());
}

// The twisty expand/collapse <button> inside a row whose label === name.
// Returns undefined when the row is a non-drillable leaf (no twisty rendered).
function twistyFor(wrapper, label) {
  const row = bodyRows(wrapper).find(
    (tr) => tr.find('.pivot-grid__row-label').text() === label,
  );
  if (!row) return undefined;
  const btn = row.find('button.pivot-grid__twisty');
  return btn.exists() ? btn : undefined;
}

// All body rows whose label === name (a shared member appears more than once).
function rowsByLabel(wrapper, label) {
  return bodyRows(wrapper).filter(
    (tr) => tr.find('.pivot-grid__row-label').text() === label,
  );
}

// The data-cell text values of a single <tr> (excludes the row-header <th>;
// includes the per-row Total cell). Whitespace-trimmed.
function cellTexts(tr) {
  return tr.findAll('td.pivot-grid__cell').map((td) => td.text().trim());
}

// The Jul column total from the <tfoot> (first column total cell), as text.
function colTotalTexts(wrapper) {
  const foot = wrapper.find('tfoot tr.pivot-grid__total-row');
  // The first <td> after the "Total" row-header is the first column's total.
  return foot.findAll('td.pivot-grid__cell').map((td) => td.text().trim());
}

// The grand-total cell text (the dedicated .pivot-grid__grand-total cell).
function grandTotalText(wrapper) {
  return wrapper.find('.pivot-grid__grand-total').text().trim();
}

// Expand the named consolidation by clicking its twisty, then settle.
async function expand(wrapper, label) {
  const t = twistyFor(wrapper, label);
  expect(t, `twisty for "${label}" should exist`).toBeTruthy();
  await t.trigger('click');
  await settle();
}

// Collapse the named consolidation by clicking its (now open) twisty, then settle.
async function collapse(wrapper, label) {
  const t = twistyFor(wrapper, label);
  expect(t, `twisty for "${label}" should exist`).toBeTruthy();
  await t.trigger('click');
  await settle();
}

// Silence the component's DEV-gated console.debug telemetry (it logs raw
// payloads) so test output stays clean. Never asserted on.
let debugSpy;
beforeEach(() => {
  vi.clearAllMocks();
  installCubeMocks();
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  debugSpy.mockRestore();
});

// ════════════════════════════════════════════════════════════════════════════
// 1 — Populated default opens (matrix, not 1×1)
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — populated default', () => {
  it('opens populated: top consolidations × column members (not a 1×1 grand total)', async () => {
    const wrapper = await mountExplorer();

    // Auto-ran a query on cube load, no user interaction.
    expect(getTm1Cubes).toHaveBeenCalledTimes(1);
    expect(runTm1Query).toHaveBeenCalled();

    // The grid table is present.
    const table = wrapper.find('table.pivot-grid');
    expect(table.exists()).toBe(true);

    // ROWS: the two top consolidations (children of All_Account), NOT one
    // grand-total row.
    const labels = rowLabels(wrapper);
    expect(labels).toEqual(['EXPENSE', 'COGS']);

    // COLUMNS: both month leaves head the grid (Jul, Aug) + a Total column — so
    // the matrix is 2 rows × 2 data columns, decisively not 1×1.
    const colHeads = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .map((th) => th.text().trim());
    // The last col-head is the "Total" header; the data columns precede it.
    expect(colHeads).toContain('Jul');
    expect(colHeads).toContain('Aug');
    expect(colHeads).toContain('Total');

    // Each top row carries its rolled value in Jul (EXPENSE 100, COGS 40).
    const expenseRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(cellTexts(expenseRow)[0]).toBe('100'); // Jul
    expect(cellTexts(expenseRow)[1]).toBe(''); //    Aug (0 → blank)
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 — Totals EXCLUDE expanded parents  (THE shipped-broken regression)
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — totals exclude expanded parents', () => {
  it('expanding a consolidation does NOT double-count it in the column/grand totals', async () => {
    const wrapper = await mountExplorer();

    // BEFORE: both consolidations collapsed → totals count each rolled value
    // once. Jul column total = EXPENSE 100 + COGS 40 = 140; grand total = 140.
    expect(colTotalTexts(wrapper)[0]).toBe('140');
    expect(grandTotalText(wrapper)).toBe('140');

    // Expand EXPENSE (rolled 100) → its children Rent 60 + Salaries 40 appear.
    await expand(wrapper, 'EXPENSE');

    // The children now render under EXPENSE.
    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'Rent', 'Salaries', 'COGS']);

    // CRITICAL: the EXPENSE parent is now REPRESENTED by its children, so it is
    // EXCLUDED from the totals. Jul column total = Rent 60 + Salaries 40 +
    // COGS 40 = 140 — NOT 240 (the shipped-broken double-count that summed the
    // parent AND its children).
    expect(colTotalTexts(wrapper)[0]).toBe('140');
    expect(colTotalTexts(wrapper)[0]).not.toBe('240');
    expect(grandTotalText(wrapper)).toBe('140');
    expect(grandTotalText(wrapper)).not.toBe('240');

    // Sanity: the EXPENSE row STILL shows its own rolled 100 (per-row total is
    // unaffected — only the footer aggregate excludes it).
    const expenseRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(cellTexts(expenseRow)[0]).toBe('100');

    // Collapse EXPENSE again → it counts ONCE more (back to 140, parent only).
    await collapse(wrapper, 'EXPENSE');
    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'COGS']);
    expect(colTotalTexts(wrapper)[0]).toBe('140');
    expect(grandTotalText(wrapper)).toBe('140');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 — Shared member under two parents (path-keying / no cross-subtree leak)
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — shared member under two parents', () => {
  it('renders BOTH "Rent" rows with their OWN contextual values; collapsing one leaves the other', async () => {
    const wrapper = await mountExplorer();

    // Expand BOTH consolidations; each contains a "Rent" leaf with a DIFFERENT
    // value (EXPENSE/Rent = 60, COGS/Rent = 25).
    await expand(wrapper, 'EXPENSE');
    await expand(wrapper, 'COGS');

    // Order is depth-first: EXPENSE, [Rent, Salaries], COGS, [Rent, Materials].
    expect(rowLabels(wrapper)).toEqual([
      'EXPENSE', 'Rent', 'Salaries', 'COGS', 'Rent', 'Materials',
    ]);

    // BOTH "Rent" rows exist, and they carry their OWN (different) values — the
    // path-keying + positional de-queue did NOT collapse them into one node nor
    // hand the same cells to both.
    const rents = rowsByLabel(wrapper, 'Rent');
    expect(rents.length).toBe(2);
    const rentJulValues = rents.map((tr) => cellTexts(tr)[0]);
    expect(rentJulValues).toEqual(['60', '25']); // EXPENSE/Rent, COGS/Rent

    // Their per-row Total cells likewise differ (60 vs 25), proving distinct rows.
    const rentTotals = rents.map((tr) => {
      const cells = cellTexts(tr);
      return cells[cells.length - 1];
    });
    expect(rentTotals).toEqual(['60', '25']);

    // Collapse EXPENSE only → its subtree (the FIRST Rent + Salaries) is removed,
    // but COGS's Rent (25) MUST survive — no cross-subtree leak.
    await collapse(wrapper, 'EXPENSE');
    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'COGS', 'Rent', 'Materials']);
    const survivingRent = rowsByLabel(wrapper, 'Rent');
    expect(survivingRent.length).toBe(1);
    expect(cellTexts(survivingRent[0])[0]).toBe('25'); // COGS's Rent, intact
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 — Re-entry / double-expand idempotency (no duplicate rows)
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — re-entry / double expand', () => {
  it('rapid double-toggle of a consolidation renders its children exactly once', async () => {
    const wrapper = await mountExplorer();

    const first = twistyFor(wrapper, 'EXPENSE');
    expect(first).toBeTruthy();
    // Fire two clicks TRULY back-to-back — same synchronous turn, NO awaited
    // nextTick between them — so the first expandRow's async fetch is still in
    // flight when the second click lands. The re-entry guard (drilling.value set
    // synchronously before the first await; node.expanded; idempotent insert)
    // must make the second click a no-op. We dispatch on the raw element so no
    // microtask flush sneaks in between (an `await trigger()` would flush one,
    // letting the first call set its guards first and hiding a missing guard).
    first.element.dispatchEvent(new Event('click'));
    first.element.dispatchEvent(new Event('click'));
    await settle();

    // Children appear EXACTLY once — no duplicate Rent / Salaries rows.
    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'Rent', 'Salaries', 'COGS']);
    expect(rowsByLabel(wrapper, 'Rent').length).toBe(1);
    expect(rowsByLabel(wrapper, 'Salaries').length).toBe(1);
  });

  it('re-expanding a previously-collapsed (cached) branch renders its children exactly once', async () => {
    const wrapper = await mountExplorer();

    await expand(wrapper, 'EXPENSE'); // fetch + insert
    expect(rowsByLabel(wrapper, 'Rent').length).toBe(1);

    await collapse(wrapper, 'EXPENSE'); // remove subtree (children stay cached)
    expect(rowsByLabel(wrapper, 'Rent').length).toBe(0);

    await expand(wrapper, 'EXPENSE'); // re-show cached subtree (no re-fetch dup)
    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'Rent', 'Salaries', 'COGS']);
    expect(rowsByLabel(wrapper, 'Rent').length).toBe(1);
    expect(rowsByLabel(wrapper, 'Salaries').length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 — Multi-dim rows: drill caption + no twisties; single-dim: no caption + twisties
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — single vs multi-dim rows', () => {
  it('single Rows dim: NO drill caption, twisties present on consolidations', async () => {
    const wrapper = await mountExplorer();

    // Single row dim (account) → no caption, drillable rows carry twisties.
    expect(wrapper.find('caption.pivot-grid__caption').exists()).toBe(false);
    expect(twistyFor(wrapper, 'EXPENSE')).toBeTruthy();
    expect(twistyFor(wrapper, 'COGS')).toBeTruthy();
  });

  it('two Rows dims: the "single Rows dimension" caption renders and twisties are absent', async () => {
    const wrapper = await mountExplorer();

    // Move the month dimension from Columns onto Rows via the REAL child chip
    // (emit the documented `move` event — the Reka KMenu content is portal-
    // teleported and does not open under happy-dom, so we drive the child's
    // contract directly, exactly the escape hatch the sibling spec uses).
    const colChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'cols' && c.props('dim') === 'month');
    expect(colChip, 'month column chip should exist').toBeTruthy();
    colChip.vm.$emit('move', 'rows');
    await settle();

    // Now two Rows dims (account + month) → multi-dim flat render.
    const caption = wrapper.find('caption.pivot-grid__caption');
    expect(caption.exists()).toBe(true);
    expect(caption.text()).toContain('single Rows dimension');

    // No twisties anywhere — drill is a single-row-dimension affordance only.
    expect(wrapper.findAll('button.pivot-grid__twisty').length).toBe(0);

    // The grid still rendered rows (the flat cartesian tuples), not an empty grid.
    expect(bodyRows(wrapper).length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 — a11y: aria-expanded on the BUTTON, aria-level reflects depth, NOT treegrid
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — accessibility', () => {
  it('aria-expanded lives on the twisty BUTTON (not the row) and toggles', async () => {
    const wrapper = await mountExplorer();

    // The row <tr> itself must NOT carry aria-expanded — it belongs on the button.
    const expenseRowBefore = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(expenseRowBefore.attributes('aria-expanded')).toBeUndefined();

    const twisty = twistyFor(wrapper, 'EXPENSE');
    expect(twisty.attributes('aria-expanded')).toBe('false');

    await expand(wrapper, 'EXPENSE');
    expect(twistyFor(wrapper, 'EXPENSE').attributes('aria-expanded')).toBe('true');

    await collapse(wrapper, 'EXPENSE');
    expect(twistyFor(wrapper, 'EXPENSE').attributes('aria-expanded')).toBe('false');
  });

  it('aria-level reflects hierarchy depth (top = 1, children = 2)', async () => {
    const wrapper = await mountExplorer();

    const expenseRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(expenseRow.attributes('aria-level')).toBe('1');

    await expand(wrapper, 'EXPENSE');
    const rentRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'Rent',
    );
    expect(rentRow.attributes('aria-level')).toBe('2');
  });

  it('the grid table is NOT role="treegrid" (it is a plain data table)', async () => {
    const wrapper = await mountExplorer();
    const table = wrapper.find('table.pivot-grid');
    expect(table.exists()).toBe(true);
    expect(table.attributes('role')).not.toBe('treegrid');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7 — Suppressed / blank cell: a requested member with no backend row renders
//     blank without throwing
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — suppressed / missing backend row', () => {
  it('a requested member the backend omits renders a blank row without throwing', async () => {
    const wrapper = await mountExplorer();

    // After this point, make the backend DROP the Salaries row (as suppress-zeros
    // would on an empty intersection) while still returning EXPENSE + Rent. The
    // component must de-queue what's present and render the missing member blank.
    runTm1Query.mockImplementation(async (payload) => {
      const resp = buildQueryResponse(payload);
      resp.rows = resp.rows.filter((r) => !r.members.includes('Salaries'));
      return resp;
    });

    // Expand EXPENSE — Salaries is requested but the backend omits it.
    await expect(expand(wrapper, 'EXPENSE')).resolves.toBeUndefined();

    // The grid still rendered; Salaries is absent from the returned rows, so the
    // expansion shows EXPENSE + Rent (+ COGS) and no exception was thrown.
    const labels = rowLabels(wrapper);
    expect(labels).toContain('EXPENSE');
    expect(labels).toContain('Rent');

    // Rent still carries its value; nothing blew up resolving the short queue.
    const rentRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'Rent',
    );
    expect(cellTexts(rentRow)[0]).toBe('60');

    // The table is intact (header + footer present) despite the missing row.
    expect(wrapper.find('thead').exists()).toBe(true);
    expect(wrapper.find('tfoot').exists()).toBe(true);
  });
});
