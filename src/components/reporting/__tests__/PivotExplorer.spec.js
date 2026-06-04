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
// KDL portal primitives — imported so the drag/move suites can locate the
// specific teleporting KMenu / KPopover instances by component (their content
// is portal-rendered to <body>, so we drive their controlled open state).
import KMenu from '../../klikk/KMenu.vue';
import KPopover from '../../klikk/KPopover.vue';
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

// A FOURTH dimension used only by the drag-and-drop suite below: `year` is a
// filter dimension in the 4-dim layout, so it gives us a Context pill to drag
// onto an axis (Context→Rows) and a move-menu to exercise the keyboard path.
// It is additive — the existing 3-dim suites pass dimensions:[account,month,
// measure] and never request `year`, so their behaviour is unchanged.
const YEAR = {
  top: 'All_Year',
  children: {
    All_Year: [
      { name: 'FY24', type: 'C' },
      { name: 'FY25', type: 'C' },
    ],
    FY24: [
      { name: 'FY24-H1', type: 'N' },
      { name: 'FY24-H2', type: 'N' },
    ],
    FY25: [
      { name: 'FY25-H1', type: 'N' },
      { name: 'FY25-H2', type: 'N' },
    ],
  },
};

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
  year: [
    { name: 'All_Year', type: 'C' },
    { name: 'FY24', type: 'C' },
    { name: 'FY25', type: 'C' },
    { name: 'FY24-H1', type: 'N' },
    { name: 'FY24-H2', type: 'N' },
    { name: 'FY25-H1', type: 'N' },
    { name: 'FY25-H2', type: 'N' },
  ],
  measure: [{ name: 'Amount', type: 'N' }],
};

const CHILDREN = {
  account: ACCOUNT.children,
  month: MONTH.children,
  year: YEAR.children,
  measure: MEASURE.children,
};

// Scalar values for the `year` dimension's members (used only by the drag suite
// when `year` is reassigned onto an axis — so the re-query after the drag
// returns NON-zero rows that render, rather than all-blank rows the grid could
// suppress). Distinct, non-zero, and stable. Account members never collide with
// these keys, so the account suites are unaffected.
const YEAR_VALUE = {
  All_Year: 700,
  FY24: 300,
  FY25: 400,
  'FY24-H1': 150,
  'FY24-H2': 150,
  'FY25-H1': 200,
  'FY25-H2': 200,
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
  if (anyKey != null) return { value: ACCOUNT.leafValue[anyKey], scope };
  // Not an account member — `year` (or another non-account row dim, e.g. after a
  // Context→Rows drag). Return its scalar so the re-query renders real rows.
  if (YEAR_VALUE[member] != null) return { value: YEAR_VALUE[member], scope };
  return { value: 0, scope };
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

// ── DRAG-AND-DROP helpers (the drag/move suites) ─────────────────────────────
// jsdom/happy-dom cannot perform a REAL HTML5 drag — there is no native drag
// image and no auto-populated DataTransfer. So we test the WIRING: we dispatch
// the same DOM drag events the browser would, with a STUBBED dataTransfer (the
// component reads/writes .effectAllowed + .setData), on the SAME elements the
// real handlers are bound to (the draggable tokens + the role="group" zones).
// What we assert is OBSERVABLE state — which well a dimension lives in, the
// active-highlight class, the re-query — never internal handler calls alone.
// These are explicitly WIRING tests, NOT a true-drag test; the visual drag
// (drag image following the cursor, native drop) still needs a browser eyeball.

// A minimal DataTransfer stand-in. The component only touches effectAllowed and
// setData('text/plain', dim); getData is provided for completeness.
function makeDataTransfer(dim = '') {
  return {
    effectAllowed: '',
    dropEffect: '',
    _data: { 'text/plain': dim },
    setData(type, val) {
      this._data[type] = val;
    },
    getData(type) {
      return this._data[type] ?? '';
    },
  };
}

// Dispatch a drag-family DOM event carrying a stubbed dataTransfer (and an
// optional relatedTarget, for dragleave containment). Returns the event so a
// caller can inspect defaultPrevented if needed.
function fireDrag(el, type, { dataTransfer, relatedTarget } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransfer ?? makeDataTransfer(),
    configurable: true,
  });
  if (relatedTarget !== undefined) {
    Object.defineProperty(event, 'relatedTarget', {
      value: relatedTarget,
      configurable: true,
    });
  }
  el.dispatchEvent(event);
  return event;
}

// The three drop ZONES, found by their role="group" aria-label (semantic, not
// class-coupled). 'filter' → Context bar, 'rows' / 'cols' → the axis wells.
function zone(wrapper, which) {
  const needle = { filter: 'Filter context', rows: 'Rows axis', cols: 'Columns axis' }[which];
  return wrapper
    .findAll('[role="group"]')
    .find((g) => (g.attributes('aria-label') || '').includes(needle));
}

// A Context-bar filter TOKEN (the draggable pill-group) for dimension `dim`,
// located via its title ("<dim> — drag to Rows or Columns…"). The token GROUP +
// its inner buttons are draggable=false; the dragging-cue class still lands on
// this group, so it remains the right element for classes()/title assertions.
function filterToken(wrapper, dim) {
  return wrapper
    .findAll('.pivot-context .pivot-token')
    .find((t) => (t.attributes('title') || '').startsWith(`${dim} `));
}

// The GRIP HANDLE inside a Context-bar filter token — the SOLE drag-initiation
// surface (the only element carrying dragstart/dragend). The token group + its
// buttons are draggable=false, so dragstart/dragend MUST be dispatched on the
// grip; events bubble UP and the grip is the token's first child, so the moved
// handler only fires when the grip is the dispatch target.
function filterGrip(wrapper, dim) {
  return filterToken(wrapper, dim).find('.pivot-grip');
}

// True when a zone currently shows its active drop-target highlight.
function zoneActive(z) {
  return z.classes().includes('pivot-dropzone--active');
}

// The axis chips as a quick "axis:dim" snapshot — what lives where right now.
function chipMap(wrapper) {
  return wrapper
    .findAllComponents(PivotAxisChip)
    .map((c) => `${c.props('axis')}:${c.props('dim')}`);
}

// Mount with the FOUR-dim layout (account rows, month cols, year + measure
// filters) so the Context bar carries a draggable `year` pill + its move menu.
// attachTo: document.body is REQUIRED — Reka teleports KMenu/KPopover content to
// <body>, and only a body-attached wrapper lets the teleported menu items /
// picker panel render (and be clicked) under happy-dom.
async function mountExplorer4d() {
  installCubeMocks({ dimensions: ['account', 'month', 'year', 'measure'] });
  const wrapper = mount(PivotExplorer, { attachTo: document.body });
  attachedWrappers.push(wrapper);
  await settle();
  return wrapper;
}

// Silence the component's DEV-gated console.debug telemetry (it logs raw
// payloads) so test output stays clean. Never asserted on.
let debugSpy;
// Body-attached wrappers (the drag/move suites attach to document.body so Reka's
// teleported menu/popover content renders) are tracked + torn down here so
// teleported nodes from one test never leak into the next test's body queries.
const attachedWrappers = [];
beforeEach(() => {
  vi.clearAllMocks();
  installCubeMocks();
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  while (attachedWrappers.length) {
    const w = attachedWrappers.pop();
    try {
      w.unmount();
    } catch {
      /* already unmounted */
    }
  }
  // Clear any teleported portal nodes left in <body> (KMenu / KPopover content).
  document.body.innerHTML = '';
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
    // Use the FOUR-dim layout (account rows, month cols, year + measure filters)
    // so we can put a SECOND dimension on Rows while a Cols dim REMAINS — moving
    // the only Cols dim instead would empty the Columns axis (canRun → false),
    // which now correctly clears the grid to the needs-config empty state (the
    // P2-C fix). Adding `year` to Rows keeps month on Cols, so canRun stays true
    // and the multi-dim caption renders over a STILL-POPULATED grid — exactly the
    // state this test means to exercise.
    const wrapper = await mountExplorer4d();

    // Baseline: account on Rows, month on Cols, year a draggable Context pill.
    expect(chipMap(wrapper)).toEqual(['rows:account', 'cols:month']);

    // Drag the year filter pill onto the Rows well (the proven WIRING path: real
    // draggable token + real role="group" zone + stubbed dataTransfer). This adds
    // year as a SECOND Rows dim — account + year on Rows, month staying on Cols.
    const yearPill = filterToken(wrapper, 'year');
    expect(yearPill, 'year should be a draggable Context pill').toBeTruthy();
    const dt = makeDataTransfer('year');
    const rowsWell = zone(wrapper, 'rows');
    fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
    fireDrag(rowsWell.element, 'dragover', { dataTransfer: dt });
    fireDrag(rowsWell.element, 'drop', { dataTransfer: dt });
    await settle();

    // Two Rows dims now (account + year), month still on Cols → canRun stays true,
    // and the rows render as the flat multi-dim cartesian tuples (no drill tree).
    expect(chipMap(wrapper)).toContain('rows:account');
    expect(chipMap(wrapper)).toContain('rows:year');
    expect(chipMap(wrapper)).toContain('cols:month');

    // The multi-dim caption renders (rowDims.length > 1).
    const caption = wrapper.find('caption.pivot-grid__caption');
    expect(caption.exists()).toBe(true);
    expect(caption.text()).toContain('single Rows dimension');

    // No twisties anywhere — drill is a single-row-dimension affordance only.
    expect(wrapper.findAll('button.pivot-grid__twisty').length).toBe(0);

    // canRun stayed true → the grid still rendered rows (the flat cartesian
    // tuples), NOT the needs-config empty state — proving the multi-dim caption
    // sits over a live grid, not over a cleared/stale one.
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

// ════════════════════════════════════════════════════════════════════════════
// 8 — DRAG-AND-DROP dimension pivoting (WIRING, not a true visual drag)
//
// jsdom/happy-dom has no native HTML5 drag (no DataTransfer the browser
// populates, no drag image). These tests drive the component's drag HANDLERS via
// synthetic DOM drag events with a stubbed dataTransfer, on the real draggable
// tokens + the real role="group" drop zones, and assert OBSERVABLE state: which
// well a dimension lands in, the active-highlight class lifecycle, and the
// re-query. The visual drag itself (cursor-following image, native drop effect)
// is NOT covered here and needs a browser eyeball — see the report.
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — drag reassign (Context → Rows)', () => {
  it('dragging the year filter pill onto the Rows well makes year a Rows dimension and re-queries', async () => {
    const wrapper = await mountExplorer4d();

    // Baseline: account on Rows, month on Cols, year a Context filter pill.
    expect(chipMap(wrapper)).toEqual(['rows:account', 'cols:month']);
    const yearPill = filterToken(wrapper, 'year');
    expect(yearPill, 'year should be a draggable Context pill').toBeTruthy();

    const callsBefore = runTm1Query.mock.calls.length;
    const dt = makeDataTransfer('year');

    // dragstart on the year GRIP (the sole drag surface) — the component records
    // the dragged dim and dims the source TOKEN (the dragging class lands on the
    // group, so the classes() assertion still reads the token, not the grip).
    fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
    await flushPromises();
    expect(
      yearPill.classes(),
      'source token recedes (dragging cue) on dragstart',
    ).toContain('pivot-token--dragging');
    // effectAllowed is set by the handler — proves the real onDimDragStart ran
    // against our stubbed dataTransfer (not a no-op).
    expect(dt.effectAllowed).toBe('move');

    // dragover the Rows well (the .prevent handler is what permits the drop).
    const rowsWell = zone(wrapper, 'rows');
    fireDrag(rowsWell.element, 'dragover', { dataTransfer: dt });
    await flushPromises();

    // drop on the Rows well → moveDimension('year','rows').
    fireDrag(rowsWell.element, 'drop', { dataTransfer: dt });
    await settle();

    // OBSERVABLE outcome: year is now a Rows axis chip (no longer a Context pill),
    // account stayed on Rows, month stayed on Cols.
    expect(chipMap(wrapper)).toContain('rows:year');
    expect(chipMap(wrapper)).toContain('rows:account');
    expect(chipMap(wrapper)).toContain('cols:month');
    // The year pill is gone from the Context bar.
    expect(filterToken(wrapper, 'year')).toBeUndefined();

    // A re-query fired (the reassign re-seeds + re-runs), and the dragging cue
    // cleared (drop resets draggingDim).
    expect(runTm1Query.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(zoneActive(rowsWell)).toBe(false);

    // The grid still renders rows after the reassign (sensible re-query, not an
    // empty grid) — the well now has TWO row chips and the body has rows.
    expect(bodyRows(wrapper).length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9 — Drop-zone highlight lifecycle (dragenter/over set; containment-guarded
//     dragleave; drop + dragend clear)
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — drop-zone highlight lifecycle', () => {
  it('dragenter/over activates a zone; dragleave to a CHILD keeps it; dragleave OUTSIDE clears it', async () => {
    const wrapper = await mountExplorer4d();
    const dt = makeDataTransfer('year');

    // No highlight before a drag starts.
    const rowsWell = zone(wrapper, 'rows');
    expect(zoneActive(rowsWell)).toBe(false);

    // Begin dragging (on the grip), then enter the Rows well → it activates.
    fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
    fireDrag(rowsWell.element, 'dragenter', { dataTransfer: dt });
    await flushPromises();
    expect(zoneActive(rowsWell)).toBe(true);

    // dragleave whose relatedTarget is a CHILD still inside the zone must NOT
    // clear the highlight (the containment guard) — crossing onto the inner
    // label / chips fires dragleave on the zone, but we have not left it.
    const childInside = rowsWell.find('.pivot-well__label').element;
    fireDrag(rowsWell.element, 'dragleave', { dataTransfer: dt, relatedTarget: childInside });
    await flushPromises();
    expect(zoneActive(rowsWell), 'leave to a child does NOT clear').toBe(true);

    // dragleave whose relatedTarget is OUTSIDE the zone clears the highlight.
    fireDrag(rowsWell.element, 'dragleave', { dataTransfer: dt, relatedTarget: document.body });
    await flushPromises();
    expect(zoneActive(rowsWell), 'leave outside the zone clears').toBe(false);

    fireDrag(filterGrip(wrapper, 'year').element, 'dragend', { dataTransfer: dt });
    await flushPromises();
  });

  it('drop clears the active highlight and the dragging-source cue', async () => {
    const wrapper = await mountExplorer4d();
    const yearPill = filterToken(wrapper, 'year');
    const dt = makeDataTransfer('year');
    const rowsWell = zone(wrapper, 'rows');

    fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
    fireDrag(rowsWell.element, 'dragover', { dataTransfer: dt });
    await flushPromises();
    expect(zoneActive(rowsWell)).toBe(true);
    expect(yearPill.classes()).toContain('pivot-token--dragging');

    fireDrag(rowsWell.element, 'drop', { dataTransfer: dt });
    await settle();

    // Both cues are gone after a drop.
    expect(zoneActive(rowsWell)).toBe(false);
    // year became a chip; assert the highlight cleared on every remaining zone.
    expect(zoneActive(zone(wrapper, 'cols'))).toBe(false);
  });

  it('dragend (drag abandoned outside any zone) clears the active highlight and source cue', async () => {
    const wrapper = await mountExplorer4d();
    const yearPill = filterToken(wrapper, 'year');
    const dt = makeDataTransfer('year');
    const colsWell = zone(wrapper, 'cols');

    fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
    fireDrag(colsWell.element, 'dragover', { dataTransfer: dt });
    await flushPromises();
    expect(zoneActive(colsWell)).toBe(true);
    expect(yearPill.classes()).toContain('pivot-token--dragging');

    // Abandon the drag (mouse released off any zone) → dragend on the source grip.
    fireDrag(filterGrip(wrapper, 'year').element, 'dragend', { dataTransfer: dt });
    await flushPromises();

    // The highlight AND the source cue clear; year is STILL a filter pill (no
    // reassign happened — dragend is not a drop).
    expect(zoneActive(colsWell)).toBe(false);
    expect(filterToken(wrapper, 'year').classes()).not.toContain('pivot-token--dragging');
    expect(chipMap(wrapper)).toEqual(['rows:account', 'cols:month']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10 — No-op on same-zone drop (dropping a Rows dim back on the Rows well)
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — same-zone drop is a no-op', () => {
  it('dropping the account Rows chip back onto the Rows well does not re-query or change state', async () => {
    const wrapper = await mountExplorer4d();

    // Grab the account axis chip (it lives in the Rows well) as the drag source.
    const accountChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');
    expect(accountChip, 'account row chip should exist').toBeTruthy();
    // The chip's GRIP is the sole drag surface (the chip button is draggable=
    // false); dispatch dragstart/dragend on it, not on the button.
    const chipGrip = accountChip.find('.pivot-grip');
    expect(chipGrip.exists()).toBe(true);

    const rowLabelsBefore = rowLabels(wrapper);
    const chipMapBefore = chipMap(wrapper);
    const callsBefore = runTm1Query.mock.calls.length;
    const dt = makeDataTransfer('account');

    // Start dragging the account chip (via its grip), hover the Rows well (its own
    // well), drop.
    fireDrag(chipGrip.element, 'dragstart', { dataTransfer: dt });
    const rowsWell = zone(wrapper, 'rows');
    fireDrag(rowsWell.element, 'dragover', { dataTransfer: dt });
    fireDrag(rowsWell.element, 'drop', { dataTransfer: dt });
    await settle();

    // onZoneDrop guards `assignments[dim] === target` → no moveDimension, hence
    // NO re-query and NO change to the layout or the rendered rows.
    expect(runTm1Query.mock.calls.length, 'no re-query on same-zone drop').toBe(callsBefore);
    expect(chipMap(wrapper)).toEqual(chipMapBefore);
    expect(rowLabels(wrapper)).toEqual(rowLabelsBefore);
    // The highlight cleared and account is still a single Rows chip (not duped).
    expect(zoneActive(rowsWell)).toBe(false);
    expect(chipMap(wrapper).filter((s) => s === 'rows:account').length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11 — Context-pill MOVE menu (keyboard path) + member-picker still independent
//
// This exercises the REAL teleported KMenu: with attachTo:document.body the Reka
// DropdownMenuContent renders into <body>, so we open the year pill's move menu
// and CLICK the real "Move to Rows" menu item — the keyboard-operable equivalent
// of the drag. We then assert the member-picker KPopover on that same pill still
// opens independently (the move menu did not break the picker).
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — context-pill move menu (keyboard path)', () => {
  // Find the KMenu whose trigger is a given dim's move button (aria-label
  // "Move <dim> to Rows or Columns"). Discriminates on rendered trigger markup.
  function ctxMoveMenu(wrapper, dim) {
    return wrapper
      .findAllComponents(KMenu)
      .find((m) => m.html().includes(`Move ${dim} to Rows`));
  }
  // Find the member-picker KPopover for a given filter dim (its trigger pill
  // carries aria-label "<dim>: … — change member").
  function pickerPopover(wrapper, dim) {
    return wrapper
      .findAllComponents(KPopover)
      .find((p) => p.html().includes(`${dim}:`) && p.html().includes('change member'));
  }

  it('opening the year pill move menu and clicking "Move to Rows" reassigns year + re-queries', async () => {
    const wrapper = await mountExplorer4d();
    expect(chipMap(wrapper)).toEqual(['rows:account', 'cols:month']);

    const menu = ctxMoveMenu(wrapper, 'year');
    expect(menu, 'year context-pill move menu should exist').toBeTruthy();

    const callsBefore = runTm1Query.mock.calls.length;

    // Open the menu (controlled open state → component sets openCtxMenu=year).
    menu.vm.$emit('update:modelValue', true);
    await settle();

    // The teleported menu items render into <body>. Click the REAL "Move to Rows"
    // item (Reka DropdownMenuItem activates → KMenuItem emits select →
    // moveCtxDimension('year','rows')).
    const items = [...document.body.querySelectorAll('.km-item')];
    const moveToRows = items.find((el) => el.textContent.trim() === 'Move to Rows');
    expect(moveToRows, '"Move to Rows" menu item should be rendered').toBeTruthy();
    moveToRows.dispatchEvent(new Event('click', { bubbles: true }));
    await settle();

    // year reassigned to Rows via the keyboard path; account stayed on Rows.
    expect(chipMap(wrapper)).toContain('rows:year');
    expect(chipMap(wrapper)).toContain('rows:account');
    // No longer a Context pill.
    expect(filterToken(wrapper, 'year')).toBeUndefined();
    // The reassign re-queried.
    expect(runTm1Query.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('the member-picker popover on a context pill still opens independently of the move menu', async () => {
    const wrapper = await mountExplorer4d();

    // The move menu and the picker are SEPARATE affordances on the same pill.
    // Open the picker popover for the (still-filter) year pill and confirm its
    // panel renders — the move menu wiring did not hijack the picker.
    const picker = pickerPopover(wrapper, 'year');
    expect(picker, 'year member-picker popover should exist').toBeTruthy();
    picker.vm.$emit('update:modelValue', true);
    await settle();

    // The teleported picker panel renders into <body> with the dim's title.
    const panel = document.body.querySelector('.pivot-picker');
    expect(panel, 'picker panel should render').toBeTruthy();
    expect(document.body.querySelector('.pivot-picker__title')?.textContent.trim()).toBe('year');

    // Opening the picker requested the dimension's elements (lazy load) — the
    // picker is live, not inert.
    expect(getTm1DimensionElements).toHaveBeenCalledWith('year');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12 — Regression smoke after a drag reassign (drill / totals / swap / chip menu
//      all still work once a dimension has been moved by drag)
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — regression after a drag reassign', () => {
  // Drag the year filter pill onto the Columns well, leaving account the single
  // Rows dim (so drill is still available) and year + month on Columns. Shared
  // helper for the smoke checks below.
  async function dragYearToCols(wrapper) {
    const dt = makeDataTransfer('year');
    const colsWell = zone(wrapper, 'cols');
    fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
    fireDrag(colsWell.element, 'dragover', { dataTransfer: dt });
    fireDrag(colsWell.element, 'drop', { dataTransfer: dt });
    await settle();
  }

  it('drill (expand) still works after a drag reassign, and totals still exclude expanded parents', async () => {
    const wrapper = await mountExplorer4d();
    await dragYearToCols(wrapper);

    // Confirm the drag actually LANDED (year is now a Columns chip) so this is a
    // genuine post-drag state, not a vacuous pass if the drop were a no-op.
    expect(chipMap(wrapper)).toContain('cols:year');
    expect(filterToken(wrapper, 'year')).toBeUndefined();

    // account is the lone Rows dim → drill is live; EXPENSE carries a twisty.
    expect(twistyFor(wrapper, 'EXPENSE')).toBeTruthy();

    // Column totals over the Jul column still equal EXPENSE 100 + COGS 40 = 140
    // (year only fans the columns; all value still lands in Jul of FY-* via the
    // single-row-dim builder which keys cells off the FIRST col-dim member list…
    // we assert the parent-exclusion invariant, not exact column arithmetic).
    await expand(wrapper, 'EXPENSE');
    expect(rowLabels(wrapper)).toContain('Rent');
    expect(rowLabels(wrapper)).toContain('Salaries');

    // The expanded EXPENSE parent is excluded from the grand total (no double
    // count): grand total must NOT equal the doubled figure.
    const grand = grandTotalText(wrapper);
    expect(grand).not.toBe('240');
    // And the EXPENSE row still shows its own rolled value.
    const expenseRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(cellTexts(expenseRow)[0]).toBe('100');
  });

  it('an axis-chip menu still reassigns after a drag reassign', async () => {
    const wrapper = await mountExplorer4d();
    await dragYearToCols(wrapper);

    // year is now a Columns chip. Use its REAL chip `move` contract to send it
    // back to Filter (the chip menu content is teleported; the documented escape
    // hatch used by the sibling spec is to drive the child's emit directly).
    const yearColChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'cols' && c.props('dim') === 'year');
    expect(yearColChip, 'year should be a Columns chip after the drag').toBeTruthy();

    const callsBefore = runTm1Query.mock.calls.length;
    yearColChip.vm.$emit('move', 'filter');
    await settle();

    // year is back as a Context filter pill; the chip menu reassign re-queried.
    expect(filterToken(wrapper, 'year'), 'year returns to the Context bar').toBeTruthy();
    expect(chipMap(wrapper)).not.toContain('cols:year');
    expect(runTm1Query.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('the swap button still swaps the axes after a drag reassign', async () => {
    const wrapper = await mountExplorer4d();

    // First drag year OUT to Columns then back to Filter so we are back to the
    // single-dim-per-axis layout swap requires (account rows, month cols).
    await dragYearToCols(wrapper);
    const yearColChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'cols' && c.props('dim') === 'year');
    yearColChip.vm.$emit('move', 'filter');
    await settle();
    expect(chipMap(wrapper)).toEqual(['rows:account', 'cols:month']);

    const callsBefore = runTm1Query.mock.calls.length;
    // Click the toolbar Swap button (semantic: aria-label).
    const swapBtn = wrapper
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Swap rows and columns');
    expect(swapBtn, 'swap button should exist and be enabled').toBeTruthy();
    expect(swapBtn.attributes('disabled')).toBeUndefined();
    await swapBtn.trigger('click');
    await settle();

    // Axes swapped: month → Rows, account → Columns; and it re-queried.
    expect(chipMap(wrapper)).toContain('rows:month');
    expect(chipMap(wrapper)).toContain('cols:account');
    expect(runTm1Query.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
