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

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ── Mock the network boundary — the TM1 HTTP functions ───────────────────────
// PivotExplorer itself calls five (cubes / cube-dimensions / elements / children
// / query). Its child SetEditor.vue (rendered when the "Edit set…" chip menu item
// opens it) calls four MORE (hierarchies / subsets / subset-members / aliases),
// so the factory lists all nine — the four extras are inert in the pre-existing
// suites (the editor never mounts until editorDim is set) and only come alive in
// the Set-Editor integration block at the bottom.
vi.mock('../../../api/planningAnalytics', () => ({
  getTm1Cubes: vi.fn(),
  getTm1CubeDimensions: vi.fn(),
  getTm1DimensionElements: vi.fn(),
  getTm1DimensionChildren: vi.fn(),
  runTm1Query: vi.fn(),
  getTm1DimensionHierarchies: vi.fn(),
  getTm1Subsets: vi.fn(),
  getTm1SubsetMembers: vi.fn(),
  getTm1DimensionAliases: vi.fn(),
  // Display-alias relabel endpoint. PivotExplorer now auto-defaults a dim with a
  // `name` alias to it and resolves labels for the shown members via this — so it
  // is called on mount for `account` (aliases:['name'] below). The default impl
  // resolves to NO labels so displayMember falls back to PRINCIPAL keys, keeping
  // every existing text assertion (EXPENSE / Rent / COGS / Jul …) valid. The
  // dedicated alias-display coverage is the independent tester's to add.
  getTm1ElementLabels: vi.fn(),
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
  getTm1DimensionHierarchies,
  getTm1Subsets,
  getTm1SubsetMembers,
  getTm1DimensionAliases,
  getTm1ElementLabels,
} from '../../../api/planningAnalytics';
// KDL primitives the Set-Editor integration drives by component instance (the
// editor's hierarchy/subset/alias pickers teleport their dropdowns via Reka's
// SelectPortal — driving the controlled emit is the sanctioned mount-based path).
import KSelect from '../../klikk/KSelect.vue';
import KToggle from '../../klikk/KToggle.vue';
import SetEditor from '../SetEditor.vue';

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

  // Additive axis envelope (the live backend now returns this alongside the
  // legacy columns/rows). colAxis.dimensions/tuples drive the nested header band;
  // leaf order matches each row's cells. Single col dim here → 1-segment tuples.
  // The component still works WITHOUT this (legacy fallback) — included so the
  // envelope path is exercised and the nested-column tester has a realistic seam.
  const colAxis = {
    dimensions: (colDims[0]?.dimension ? [colDims[0].dimension] : []),
    tuples: columns.map((c) => c.slice()),
  };
  const rowAxis = {
    dimensions: rowDims.map((d) => d.dimension),
    tuples: rows.map((r) => r.members.slice()),
  };

  return {
    columns,
    rows,
    colAxis,
    rowAxis,
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

  // ── Set-Editor network surface (only exercised by the integration block) ────
  // account has a default + one alternate (EBITDA) so the axis-spec hierarchy key
  // is testable; month/measure/year are single-hierarchy (no alternates).
  getTm1DimensionHierarchies.mockImplementation(async (dimension) => {
    if (dimension === 'account') {
      return {
        dimension: 'account',
        default: 'account',
        hierarchies: [
          { name: 'account', is_default: true },
          { name: 'EBITDA', is_default: false },
        ],
        has_alternates: true,
      };
    }
    return {
      dimension,
      default: dimension,
      hierarchies: [{ name: dimension, is_default: true }],
      has_alternates: false,
    };
  });
  getTm1Subsets.mockImplementation(async (dimension) => (
    dimension === 'account'
      ? { subsets: [{ name: 'jse', dynamic: false }] }
      : { subsets: [] }
  ));
  getTm1SubsetMembers.mockImplementation(async (dimension, subset) => ({
    subset,
    dynamic: false,
    members: [{ name: 'Rent', type: 'N' }, { name: 'Salaries', type: 'N' }],
    truncated: false,
  }));
  getTm1DimensionAliases.mockImplementation(async (dimension) => (
    dimension === 'account' ? { dimension, aliases: ['name'] } : { dimension, aliases: [] }
  ));
  // Default alias relabel: resolve to NO labels, so displayMember falls back to
  // principal keys and existing text assertions hold. (Suites that exercise the
  // alias DISPLAY feature override this with a real label map.)
  getTm1ElementLabels.mockImplementation(async (dimension, alias) => ({
    dimension,
    alias,
    labels: {},
  }));
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

// Flip the "Suppress zeros" KToggle and settle. The toggle is a Reka SwitchRoot
// (button[role="switch"]) whose internal click does NOT fire under happy-dom —
// the SAME limitation the suite already documents for the teleporting KMenu /
// KPopover / KSelect primitives, all of which are driven via their controlled
// update emit. So we mount the REAL KToggle and drive its v-model the sanctioned
// way (the consumer's @update:modelValue handler — watch(suppressEmpty) — then
// re-runs exactly as in production). Observable DOM (dropped cols, blanked cells,
// re-query) is what every caller asserts. `on` is the desired new state.
async function setSuppress(wrapper, on) {
  const toggle = wrapper.findComponent(KToggle);
  expect(toggle.exists(), 'the Suppress zeros toggle should be mounted').toBe(true);
  expect(toggle.props('label')).toBe('Suppress zeros');
  toggle.vm.$emit('update:modelValue', on);
  await settle();
}

// ── Multi-dim row-header helpers (the INNER drill segment) ───────────────────
// With >1 row dim the row-header band holds one segment per row dim: the OUTER
// dims are plain labels and the INNERMOST segment (.pivot-grid__row-seg--inner)
// carries the twisty + indent. twistyFor() above keys on the FIRST .row-label in
// a row, which is the OUTER label under multi-dim — so these helpers target the
// inner segment specifically.

// The inner-segment label text of a body row (the drill member name).
function innerLabelOf(tr) {
  const seg = tr.find('.pivot-grid__row-seg--inner .pivot-grid__row-label');
  return seg.exists() ? seg.text().trim() : null;
}

// Body rows whose INNER-segment label === member (a member repeats once per outer
// block across the crossjoin fan).
function rowsByInner(wrapper, member) {
  return bodyRows(wrapper).filter((tr) => innerLabelOf(tr) === member);
}

// The twisty <button> on the INNER segment of the first row whose inner label
// === member. undefined when that inner member is a non-drillable leaf.
function innerTwistyFor(wrapper, member) {
  const row = bodyRows(wrapper).find((tr) => innerLabelOf(tr) === member);
  if (!row) return undefined;
  const btn = row.find('.pivot-grid__row-seg--inner button.pivot-grid__twisty');
  return btn.exists() ? btn : undefined;
}

// Expand/collapse a multi-dim INNER consolidation (clicks its inner-segment
// twisty), then settle. Drives the real toggleRow → expand/collapse path.
async function expandInner(wrapper, member) {
  const t = innerTwistyFor(wrapper, member);
  expect(t, `inner twisty for "${member}" should exist`).toBeTruthy();
  await t.trigger('click');
  await settle();
}
async function collapseInner(wrapper, member) {
  const t = innerTwistyFor(wrapper, member);
  expect(t, `inner twisty for "${member}" should exist`).toBeTruthy();
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

// ── MULTI-DIM (year × account) row drill — the crossjoin response builder ─────
// The multi-dimension row drill puts `account` as the INNERMOST row dim and
// `year` as the OUTER fan. For that, account must come AFTER year in the cube's
// dimension list (rowDims preserves declaration order; innerRowDim = last). So
// this layout declares dimensions as [year, account, month, measure]: the default
// assignment then puts account on Rows (the only /account/ match), month on Cols,
// year + measure on Filters — and dragging year onto Rows makes rowDims
// [year, account] → account innermost. The default 3-dim buildQueryResponse only
// models the single-row-dim path; here we model the REAL crossjoin the component
// sends once year is on rows: rows=[{year, …}, {account, …}], outer-slowest.
//
// For each OUTER (year) member we re-walk the inner (account) member list — which
// already arrives depth-first from the drill tree (e.g. [EXPENSE, Rent, Salaries,
// COGS] once EXPENSE is open) — tracking the enclosing account consolidation scope
// (reset per outer block) so every occurrence (incl. the shared "Rent" under two
// rollups) gets ITS OWN contextual value, exactly as TM1 returns positionally.
// Year is a pure fan (factor 1), so each year block repeats the same account
// values — keeping the arithmetic transparent and the drill structure the focus.
function buildMultiDimResponse(payload) {
  const rowDims = payload.rows || [];
  const colMembers = (payload.cols?.[0]?.members || []).slice();
  const columns = colMembers.map((m) => [m]);
  const colFactor = (cm) => (cm === 'Jul' ? 1 : 0);
  const cellsFor = (scalar) =>
    colMembers.map((cm) => ({ value: scalar * colFactor(cm), formatted: null }));

  // Only the 2-row-dim (year outer × account inner) shape is modelled here.
  if (rowDims.length !== 2) {
    return { columns, rows: [], mdx: `SELECT FROM [${payload.cube}]` };
  }
  const [outer, inner] = rowDims;
  const outerMembers = outer.members || [];
  const innerMembers = inner.members || [];

  const rows = [];
  for (const om of outerMembers) {
    let scope = null; // account consolidation scope, reset per outer block.
    for (const im of innerMembers) {
      const { value, scope: nextScope } = leafValueFor(im, scope);
      scope = nextScope;
      rows.push({ members: [om, im], cells: cellsFor(value) });
    }
  }
  const colAxis = {
    dimensions: (payload.cols?.[0]?.dimension ? [payload.cols[0].dimension] : []),
    tuples: columns.map((c) => c.slice()),
  };
  const rowAxis = {
    dimensions: rowDims.map((d) => d.dimension),
    tuples: rows.map((r) => r.members.slice()),
  };
  return { columns, rows, colAxis, rowAxis, mdx: `SELECT FROM [${payload.cube}]` };
}

// Mount with account as the INNERMOST row dim by declaring [year, account,
// month, measure] and wiring runTm1Query to the multi-dim crossjoin builder once
// >1 row dim is requested (it falls back to the single-dim builder before the
// year→rows drag, so the auto-open grid is identical to the 3-dim suites). Used
// by the multi-dim drill / shared-member / a11y blocks below.
async function mountExplorerMultiDim() {
  installCubeMocks({ dimensions: ['year', 'account', 'month', 'measure'] });
  runTm1Query.mockImplementation(async (payload) =>
    (payload.rows || []).length > 1
      ? buildMultiDimResponse(payload)
      : buildQueryResponse(payload),
  );
  const wrapper = mount(PivotExplorer, { attachTo: document.body });
  attachedWrappers.push(wrapper);
  await settle();
  return wrapper;
}

// Put `year` on Rows (as a SECOND row dim, account staying innermost) via the
// proven drag WIRING — the real draggable grip + real role="group" Rows zone +
// stubbed dataTransfer. After this rowDims === [year, account]. Returns nothing;
// the caller asserts the resulting multi-dim grid.
async function dragYearToRows(wrapper) {
  const dt = makeDataTransfer('year');
  const rowsWell = zone(wrapper, 'rows');
  fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
  fireDrag(rowsWell.element, 'dragover', { dataTransfer: dt });
  fireDrag(rowsWell.element, 'drop', { dataTransfer: dt });
  await settle();
}

// KNOWN BUG containment (see report: BUG-1) — when the Set Editor opens, its
// alias picker feeds KSelect an option { value: '' }, which Reka's <SelectItem>
// rejects ("must have a value prop that is not an empty string"). Reka mounts the
// Select content eagerly under happy-dom → an async unhandled rejection on every
// editor mount, unrelated to what the integration asserts. We swallow ONLY that
// specific Reka rejection (re-throwing any other), so a real unhandled error is
// never masked. The defect is asserted/owned in SetEditor.spec.js (BUG-1).
const REKA_EMPTY_VALUE = 'must have a value prop that is not an empty string';
function onUnhandled(err) {
  const msg = (err && (err.message || String(err))) || '';
  if (msg.includes(REKA_EMPTY_VALUE)) return;
  throw err;
}
// A second, narrowly-scoped guard for a happy-dom TEARDOWN artifact: tearing down
// a body-attached wrapper that has an OPEN teleported KDialog (the Set Editor) +
// teleported Reka Selects trips Vue's unmount with "Cannot read properties of
// null (reading 'type')" inside unmountComponent — an UNCAUGHT EXCEPTION from the
// async unmount scheduler (so the afterEach try/catch can't reach it). It is a
// pure teardown/teleport quirk, not a behavioural failure (every assertion has
// already run). We swallow ONLY that exact Vue-internal unmount TypeError and
// re-throw anything else, so a real uncaught error is never masked.
function isTeleportUnmountArtifact(err) {
  const msg = (err && (err.message || String(err))) || '';
  const stack = (err && err.stack) || '';
  return (
    msg.includes("Cannot read properties of null (reading 'type')") &&
    (stack.includes('unmountComponent') || stack.includes('unmount'))
  );
}
function onUncaught(err) {
  if (isTeleportUnmountArtifact(err)) return;
  throw err;
}
beforeAll(() => {
  process.on('unhandledRejection', onUnhandled);
  process.on('uncaughtException', onUncaught);
});
afterAll(() => {
  process.off('unhandledRejection', onUnhandled);
  process.off('uncaughtException', onUncaught);
});

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

    // REALIGNED for the suppress-zeros feature. This test's point is the MATRIX
    // shape — two row consolidations × the column members, decisively not a 1×1
    // grand total. The Aug column is all-zero in the fake cube (every value lands
    // in Jul), so with Suppress zeros ON (now the default) Aug is CORRECTLY
    // dropped — which would make a "full Jul+Aug matrix" assertion vacuous. We
    // turn Suppress OFF here so the full two-data-column matrix is visible and the
    // not-1×1 claim stays meaningful; column-DROP under suppress is asserted in a
    // dedicated test below ("suppress drops all-zero COLUMNS").
    await setSuppress(wrapper, false);

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

    // Each top row carries its rolled value in Jul (EXPENSE 100, COGS 40). With
    // suppress OFF the stored zero in Aug is VISIBLE as "0" (not blanked).
    const expenseRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(cellTexts(expenseRow)[0]).toBe('100'); // Jul
    expect(cellTexts(expenseRow)[1]).toBe('0'); //   Aug (suppress OFF → 0 shown)
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
// 5 — Single- vs multi-dim rows. BOTH cases now drill: there is NO "single Rows
//     dimension" caption any more, and with two row dims the twisty moves onto
//     the INNERMOST row dim's segment (the multi-dim row-drill feature).
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — single vs multi-dim rows', () => {
  it('single Rows dim: NO drill caption, twisties present on consolidations', async () => {
    const wrapper = await mountExplorer();

    // Single row dim (account) → no caption, drillable rows carry twisties.
    expect(wrapper.find('caption.pivot-grid__caption').exists()).toBe(false);
    expect(twistyFor(wrapper, 'EXPENSE')).toBeTruthy();
    expect(twistyFor(wrapper, 'COGS')).toBeTruthy();
  });

  it('two Rows dims: NO caption, and a twisty IS present on the inner (account) segment', async () => {
    // REALIGNED for the multi-dimension row-drill feature. The old behaviour was
    // a "single Rows dimension" caption + zero twisties when >1 dim sat on Rows;
    // the caption is now REMOVED and drill works across the crossjoin, with the
    // twisty living on the INNERMOST row dim's segment.
    //
    // We use the [year, account, …] layout (mountExplorerMultiDim) so account is
    // the innermost row dim: dragging year onto Rows yields rowDims [year, account]
    // (declaration order; innerRowDim = last = account). month stays on Cols so
    // canRun stays true and the grid renders over a live crossjoin, not the
    // needs-config empty state.
    const wrapper = await mountExplorerMultiDim();

    // Baseline: account on Rows, month on Cols, year a draggable Context pill.
    expect(chipMap(wrapper)).toEqual(['rows:account', 'cols:month']);

    await dragYearToRows(wrapper);

    // Two Rows dims now — year OUTER, account INNER — month still on Cols.
    expect(chipMap(wrapper)).toContain('rows:account');
    expect(chipMap(wrapper)).toContain('rows:year');
    expect(chipMap(wrapper)).toContain('cols:month');

    // The "single Rows dimension" caption is GONE (the feature removed it).
    expect(wrapper.find('caption.pivot-grid__caption').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('single Rows dimension');

    // A twisty IS present on the INNER (account) segment — EXPENSE / COGS are the
    // inner consolidations and each carries a drill twisty on its inner segment.
    expect(innerTwistyFor(wrapper, 'EXPENSE'), 'inner EXPENSE twisty').toBeTruthy();
    expect(innerTwistyFor(wrapper, 'COGS'), 'inner COGS twisty').toBeTruthy();

    // The OUTER (year) segments are plain labels — the twisty lives on the inner
    // segment only, never on an outer one. Assert no twisty sits inside an outer
    // (non-inner) segment anywhere in the grid.
    const outerTwisties = wrapper.findAll(
      '.pivot-grid__row-seg:not(.pivot-grid__row-seg--inner) button.pivot-grid__twisty',
    );
    expect(outerTwisties.length, 'no twisty on an outer-dim segment').toBe(0);

    // The grid rendered the crossjoin (year × account), proving the caption sits
    // over a live grid — and the OUTER year members head the row band.
    expect(bodyRows(wrapper).length).toBeGreaterThan(0);
    const outerLabels = bodyRows(wrapper).map((tr) =>
      tr.find('.pivot-grid__row-seg:not(.pivot-grid__row-seg--inner) .pivot-grid__row-label').text(),
    );
    expect(outerLabels).toContain('FY24');
    expect(outerLabels).toContain('FY25');
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
    // picker is live, not inert. NB: the committed PivotExplorer (888a2d1) loads
    // elements in the dim's active hierarchy, so the call is now (dim, hier) —
    // hier is null for `year` (no alternate applied). Assert on the FIRST arg so
    // the check is robust to the explicit hierarchy arg.
    const elementCalls = getTm1DimensionElements.mock.calls;
    expect(elementCalls.some((args) => args[0] === 'year')).toBe(true);
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

// ════════════════════════════════════════════════════════════════════════════
// 13 — SET EDITOR integration (open from the chip menu → Apply writes back →
//      pivot re-queries; hierarchy lands in the axis spec ONLY for an alternate)
//
// These mount the REAL PivotExplorer with its REAL child SetEditor (rendered when
// the "Edit set…" chip menu opens it). Both the chip menu and the SetEditor
// dialog teleport to <body> (Reka), so we attachTo:document.body and locate the
// teleported nodes there. The SetEditor's own member/tree behaviour is covered in
// SetEditor.spec.js — here we assert only the WIRING across the boundary:
// openSetEditor mounts the editor seeded from dimHierarchy/memberSelections, and
// applySet writes hierarchy + members back and re-queries with the right payload.
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — Set Editor integration', () => {
  // The account Rows chip (the dimension we edit), as a component wrapper.
  function accountRowChip(wrapper) {
    return wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');
  }

  // The mounted SetEditor child (only present once openSetEditor has run).
  function editor(wrapper) {
    return wrapper.findComponent(SetEditor);
  }

  // A SetEditor KSelect by its visible label ("Hierarchy" / "Load subset" /
  // "Display label"). Scoped to the editor so we never grab a PivotExplorer select.
  function editorSelect(wrapper, labelText) {
    return editor(wrapper)
      .findAllComponents(KSelect)
      .find((s) => s.props('label') === labelText);
  }

  // A teleported editor <button> located by exact text (Apply / Cancel) — the
  // dialog footer renders into <body>.
  function bodyButtonByText(text) {
    return [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === text,
    );
  }

  // Close the editor cleanly (drives v-model false) BEFORE the wrapper unmounts,
  // so the teleported dialog + Reka Selects are torn down on a settled tick — this
  // avoids the happy-dom teleport-unmount artifact at teardown rather than relying
  // solely on the afterAll guard.
  async function closeEditor(wrapper) {
    const ed = editor(wrapper);
    if (ed.exists()) {
      ed.vm.$emit('update:modelValue', false);
      await settle();
    }
  }

  // Open the Set Editor for the account Rows dim via the REAL teleported chip
  // menu: open the chip's KMenu (controlled), then click the real "Edit set…"
  // KMenuItem rendered into <body>. Returns once the editor has mounted + seeded.
  async function openEditorViaMenu(wrapper) {
    const chip = accountRowChip(wrapper);
    expect(chip, 'account row chip should exist').toBeTruthy();
    const menu = chip.findComponent(KMenu);
    menu.vm.$emit('update:modelValue', true); // open the chip menu (single-open model)
    await settle();
    const editItem = [...document.body.querySelectorAll('.km-item')].find(
      (el) => el.textContent.trim() === 'Edit set…',
    );
    expect(editItem, '"Edit set…" menu item should render').toBeTruthy();
    editItem.dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
  }

  it('opening "Edit set…" from the chip menu mounts the editor seeded with the dim + members', async () => {
    const wrapper = await mountExplorer4d();

    // The editor is NOT mounted until opened (v-if="editorDim").
    expect(editor(wrapper).exists()).toBe(false);

    await openEditorViaMenu(wrapper);

    // The editor mounted, seeded for the account dimension, and rendered its body
    // into <body> (the dialog title carries the dim).
    const ed = editor(wrapper);
    expect(ed.exists()).toBe(true);
    expect(ed.props('dimension')).toBe('account');
    expect(document.body.textContent).toContain('Edit set — account');

    // It seeded its members from memberSelections[account] — the populated default
    // is the top consolidations (EXPENSE, COGS), so the SET pane lists them.
    const setLabels = [...document.body.querySelectorAll('.se-set__label')].map(
      (el) => el.textContent.trim(),
    );
    expect(setLabels).toEqual(['EXPENSE', 'COGS']);

    // Opening fired the editor's own loaders (hierarchies for account).
    expect(getTm1DimensionHierarchies).toHaveBeenCalledWith('account');

    await closeEditor(wrapper);
  });

  it('Apply on the DEFAULT hierarchy writes members back and re-queries WITHOUT a hierarchy key', async () => {
    const wrapper = await mountExplorer4d();
    await openEditorViaMenu(wrapper);

    const callsBefore = runTm1Query.mock.calls.length;

    // Drive the editor to a KNOWN set via its apply contract through the REAL
    // child→parent wiring. We emit the editor's `apply` (what its Apply button
    // emits) so applySet runs exactly as in production. Default hierarchy → the
    // editor emits hierarchy:null (no alternate chosen).
    //
    // REALIGNED for the suppress-zeros feature: the old set was ['REVENUE'], a
    // member that is NOT in the fake cube's value map → its row is all-zero, which
    // Suppress zeros (ON by default) now correctly DROPS, so the "row present"
    // assertion would fail for the wrong reason. We apply EXPENSE instead — a real
    // consolidation carrying a non-zero value (rolled 100) — so the written row
    // SURVIVES suppression and the grid genuinely re-renders it. The payload-spec
    // assertions (members written, hierarchy key omitted on the default) are
    // unchanged in meaning.
    editor(wrapper).vm.$emit('apply', {
      dimension: 'account',
      hierarchy: null,
      members: ['EXPENSE'],
      types: { EXPENSE: 'C' },
    });
    await settle();

    // A re-query fired after the write.
    expect(runTm1Query.mock.calls.length).toBeGreaterThan(callsBefore);

    // The LAST query payload's account row axis carries the new member set and
    // OMITS the hierarchy key (default hierarchy → axisSpec drops it).
    const payload = runTm1Query.mock.calls.at(-1)[0];
    const accountAxis = payload.rows.find((r) => r.dimension === 'account');
    expect(accountAxis, 'account is a row axis spec').toBeTruthy();
    expect(accountAxis.members).toEqual(['EXPENSE']);
    expect('hierarchy' in accountAxis).toBe(false);

    // The grid actually re-rendered rows for the new selection (EXPENSE seeds the
    // tree). The row is present AND carries its rolled value (Jul 100) — surviving
    // suppression — proving the write reached the grid as observable DOM.
    expect(rowLabels(wrapper)).toEqual(['EXPENSE']);
    const expenseRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(cellTexts(expenseRow)[0]).toBe('100');

    await closeEditor(wrapper);
  });

  it('Apply on an ALTERNATE hierarchy includes `hierarchy` in the account axis spec', async () => {
    const wrapper = await mountExplorer4d();
    await openEditorViaMenu(wrapper);

    // Switch the editor to the EBITDA alternate via its REAL hierarchy picker
    // (controlled emit → onHierarchyChange reloads tree/subsets/aliases scoped to
    // EBITDA). account has_alternates:true, so the picker is rendered.
    const hierPicker = editorSelect(wrapper, 'Hierarchy');
    expect(hierPicker, 'editor hierarchy picker should exist for account').toBeTruthy();
    hierPicker.vm.$emit('update:modelValue', 'EBITDA');
    await settle();

    const callsBefore = runTm1Query.mock.calls.length;

    // Apply the built set on the alternate. The editor emits the alternate name
    // as the hierarchy (hierarchyArg returns it because it differs from default).
    editor(wrapper).vm.$emit('apply', {
      dimension: 'account',
      hierarchy: 'EBITDA',
      members: ['EXPENSE', 'COGS'],
      types: { EXPENSE: 'C', COGS: 'C' },
    });
    await settle();

    // Re-queried, and THIS time the account axis spec carries hierarchy:'EBITDA'
    // (the alternate is explicit → axisSpec includes the key).
    expect(runTm1Query.mock.calls.length).toBeGreaterThan(callsBefore);
    const payload = runTm1Query.mock.calls.at(-1)[0];
    const accountAxis = payload.rows.find((r) => r.dimension === 'account');
    expect(accountAxis.hierarchy).toBe('EBITDA');
    expect(accountAxis.members).toEqual(['EXPENSE', 'COGS']);

    // Other axes (month on Cols) stay on their default → no hierarchy key.
    const monthAxis = payload.cols.find((c) => c.dimension === 'month');
    expect(monthAxis && 'hierarchy' in monthAxis).toBe(false);

    await closeEditor(wrapper);
  });

  it('Cancel (close without apply) does NOT write or re-query', async () => {
    const wrapper = await mountExplorer4d();
    await openEditorViaMenu(wrapper);

    // Snapshot the pre-cancel state: the current account selection + query count.
    const rowsBefore = rowLabels(wrapper);
    const callsBefore = runTm1Query.mock.calls.length;

    // Click the editor's REAL Cancel button (teleported to <body>). It emits only
    // update:modelValue=false — no apply — so applySet never runs.
    const cancel = bodyButtonByText('Cancel');
    expect(cancel, 'editor Cancel button should render').toBeTruthy();
    cancel.dispatchEvent(new Event('click', { bubbles: true }));
    await settle();

    // No apply emitted → no re-query, no change to the rendered rows.
    expect(runTm1Query.mock.calls.length).toBe(callsBefore);
    expect(rowLabels(wrapper)).toEqual(rowsBefore);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 14 — SUPPRESS ZEROS (the client suppression layer + re-query on toggle)
//
// Suppress zeros is ON by default. NON EMPTY (server-side, always on the MDX)
// only drops EMPTY (null) tuples; the cube STORES 0.00 values that NON EMPTY
// keeps, so PAW's "Suppress Zeros" additionally drops anything zero-OR-empty:
//   • a ROW whose every data cell is zeroish is dropped (an EXPANDED drillable
//     parent is KEPT — its non-zero children show beneath it);
//   • a COLUMN where every SURVIVING row is zeroish is dropped;
//   • a surviving zero CELL renders BLANK (incl. a backend-formatted "0.00");
//   • totals recompute over the SURVIVORS only (still excluding expanded parents);
//   • toggling RE-QUERIES (the watch on suppressEmpty re-runs the query).
// In the fake cube every value lands in Jul (Aug is stored 0), so Aug is the
// canonical all-zero column and arithmetic stays transparent.
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — suppress zeros', () => {
  it('drops all-zero COLUMNS under suppress ON; keeps them under OFF', async () => {
    const wrapper = await mountExplorer();

    // Suppress ON (default): Aug is zero for EVERY row → the Aug column header AND
    // its cells are dropped. Only Jul (+ the Total band) remains.
    let colHeads = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .map((th) => th.text().trim());
    expect(colHeads).toContain('Jul');
    expect(colHeads).not.toContain('Aug');

    // Each surviving data row has exactly ONE data cell (Jul) + the per-row Total.
    const expenseRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(cellTexts(expenseRow)).toEqual(['100', '100']); // Jul + row Total only.

    // Suppress OFF: the Aug column re-appears (a re-query brings it back), with
    // its stored zeros now VISIBLE.
    await setSuppress(wrapper, false);
    colHeads = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .map((th) => th.text().trim());
    expect(colHeads).toContain('Jul');
    expect(colHeads).toContain('Aug');
    const expenseRowOff = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(cellTexts(expenseRowOff)).toEqual(['100', '0', '100']); // Jul, Aug, Total.
  });

  it('drops all-zero ROWS but KEEPS an expanded all-zero parent whose children are non-zero', async () => {
    const wrapper = await mountExplorer();

    // Re-shape the backend: BOTH top consolidations' OWN rows are reported all-zero
    // (their rolled cells are 0), while EXPENSE's CHILDREN Rent (60) + Salaries (40)
    // stay non-zero. This is the structural case from the suppression rule: a
    // COLLAPSED all-zero consolidation is dropped, but an EXPANDED drillable parent
    // is KEPT even when its own row is all-zero (so its non-zero children are not
    // orphaned and the collapse twisty survives). Fresh object per call (re-query on
    // expand asks again). The parent's own row is forced zero; children unchanged.
    runTm1Query.mockImplementation(async (payload) => {
      const resp = buildQueryResponse(payload);
      resp.rows = resp.rows.map((r) => {
        const inner = r.members[r.members.length - 1];
        if (inner === 'EXPENSE' || inner === 'COGS') {
          return { members: r.members, cells: r.cells.map(() => ({ value: 0, formatted: null })) };
        }
        return r;
      });
      return resp;
    });

    // Re-query under the new shape (toggle off→on round-trip), suppress staying ON.
    await setSuppress(wrapper, false);
    await setSuppress(wrapper, true);

    // Both top rows are COLLAPSED & all-zero → both dropped, leaving "No data".
    expect(bodyRows(wrapper).length).toBe(0);
    expect(wrapper.text()).toContain('No data');

    // Now turn suppress OFF so EXPENSE renders (and is drillable), expand it, then
    // turn suppress back ON: the EXPANDED EXPENSE parent must SURVIVE (its non-zero
    // children Rent/Salaries are shown beneath it) even though its own row is zero.
    await setSuppress(wrapper, false);
    expect(rowLabels(wrapper)).toContain('EXPENSE');
    await expand(wrapper, 'EXPENSE');
    await setSuppress(wrapper, true);

    const labels = rowLabels(wrapper);
    // EXPENSE (expanded, all-zero) is KEPT; its non-zero children survive.
    expect(labels).toContain('EXPENSE');
    expect(labels).toContain('Rent');
    expect(labels).toContain('Salaries');
    // COGS (collapsed, all-zero) is still suppressed.
    expect(labels).not.toContain('COGS');

    // The kept EXPENSE parent renders BLANK in its data cell (zeroish under ON)
    // while its children carry their values.
    const expenseRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    expect(cellTexts(expenseRow)[0]).toBe(''); // parent zero → blank under suppress.
    const rentRow = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'Rent',
    );
    expect(cellTexts(rentRow)[0]).toBe('60');
  });

  it('toggling suppress RE-QUERIES (runTm1Query call count increments on each toggle)', async () => {
    const wrapper = await mountExplorer();

    // One query ran on auto-open.
    const afterLoad = runTm1Query.mock.calls.length;
    expect(afterLoad).toBeGreaterThanOrEqual(1);

    // Each toggle re-runs the query (the watch on suppressEmpty, guarded on canRun).
    await setSuppress(wrapper, false);
    const afterOff = runTm1Query.mock.calls.length;
    expect(afterOff).toBe(afterLoad + 1);

    await setSuppress(wrapper, true);
    const afterOn = runTm1Query.mock.calls.length;
    expect(afterOn).toBe(afterOff + 1);

    // And the payload reflects the toggle state (suppress flag threaded through).
    expect(runTm1Query.mock.calls.at(-1)[0].suppress).toBe(true);
    expect(runTm1Query.mock.calls.at(-2)[0].suppress).toBe(false);
  });

  it('suppress-aware blanks: a zero cell and a backend "0.00" blank under ON, show under OFF', async () => {
    const wrapper = await mountExplorer();

    // Give EXPENSE's Aug cell a backend-FORMATTED "0.00" (value 0, formatted set)
    // and leave COGS's Aug a plain numeric 0. Both are zeroish. Jul stays the real
    // value so each row survives row-suppression and we can read its cells.
    runTm1Query.mockImplementation(async (payload) => {
      const resp = buildQueryResponse(payload);
      const colMembers = (payload.cols?.[0]?.members || []);
      const augIdx = colMembers.indexOf('Aug');
      resp.rows = resp.rows.map((r) => {
        const inner = r.members[r.members.length - 1];
        if (inner === 'EXPENSE' && augIdx >= 0) {
          const cells = r.cells.slice();
          cells[augIdx] = { value: 0, formatted: '0.00' }; // backend pre-formatted zero.
          return { members: r.members, cells };
        }
        return r;
      });
      return resp;
    });

    // Suppress OFF first → Aug column survives so we can observe the cells. The
    // re-query under the new shape gives EXPENSE a formatted "0.00" in Aug.
    await setSuppress(wrapper, false);
    const augIdx = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .map((th) => th.text().trim())
      .indexOf('Aug');
    expect(augIdx).toBeGreaterThanOrEqual(0);

    const expenseOff = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    const cogsOff = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'COGS',
    );
    // Suppress OFF: the backend "0.00" is shown VERBATIM; the plain numeric 0 as "0".
    expect(cellTexts(expenseOff)[augIdx]).toBe('0.00');
    expect(cellTexts(cogsOff)[augIdx]).toBe('0');

    // Suppress ON: the whole Aug column is now all-zero across survivors → it is
    // DROPPED. To observe the per-cell BLANKING (independent of column-drop), give
    // COGS a NON-zero Aug so the Aug column survives, then assert EXPENSE's
    // formatted "0.00" cell blanks while COGS's real Aug shows.
    runTm1Query.mockImplementation(async (payload) => {
      const resp = buildQueryResponse(payload);
      const colMembers = (payload.cols?.[0]?.members || []);
      const aIdx = colMembers.indexOf('Aug');
      resp.rows = resp.rows.map((r) => {
        const inner = r.members[r.members.length - 1];
        if (aIdx < 0) return r;
        const cells = r.cells.slice();
        if (inner === 'EXPENSE') cells[aIdx] = { value: 0, formatted: '0.00' }; // zeroish.
        if (inner === 'COGS') cells[aIdx] = { value: 7, formatted: null }; //     non-zero.
        return { members: r.members, cells };
      });
      return resp;
    });

    await setSuppress(wrapper, true);
    const colHeadsOn = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .map((th) => th.text().trim());
    expect(colHeadsOn).toContain('Aug'); // COGS keeps the column alive.
    const augOn = colHeadsOn.indexOf('Aug');

    const expenseOn = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'EXPENSE',
    );
    const cogsOn = bodyRows(wrapper).find(
      (tr) => tr.find('.pivot-grid__row-label').text() === 'COGS',
    );
    // Suppress ON: the backend-formatted "0.00" is BLANKED (does not leak through),
    // while the genuine non-zero Aug renders.
    expect(cellTexts(expenseOn)[augOn]).toBe('');
    expect(cellTexts(cogsOn)[augOn]).toBe('7');
  });

  it('totals recompute over SURVIVORS; a column drops only when ALL surviving rows are zero there', async () => {
    const wrapper = await mountExplorer();

    // Shape: EXPENSE (Jul 100, Aug 0), COGS (Jul 40, Aug 0), plus a THIRD all-zero
    // top row ZEROACC (Jul 0, Aug 0) that suppression must drop. Totals must then
    // be computed over the SURVIVORS only (EXPENSE + COGS), and Aug — zero across
    // every survivor — is dropped.
    runTm1Query.mockImplementation(async (payload) => {
      const colMembers = (payload.cols?.[0]?.members || []);
      const cells = (jul, aug) => colMembers.map((cm) => ({
        value: cm === 'Jul' ? jul : cm === 'Aug' ? aug : 0,
        formatted: null,
      }));
      return {
        columns: colMembers.map((m) => [m]),
        rows: [
          { members: ['EXPENSE'], cells: cells(100, 0) },
          { members: ['COGS'], cells: cells(40, 0) },
          { members: ['ZEROACC'], cells: cells(0, 0) },
        ],
        mdx: 'X',
      };
    });
    // Re-query under the new shape (suppress stays ON via an off→on round trip).
    await setSuppress(wrapper, false);
    await setSuppress(wrapper, true);

    // The all-zero ZEROACC row is dropped; only EXPENSE + COGS survive.
    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'COGS']);
    // Aug is zero across both survivors → dropped; Jul survives.
    let colHeads = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .map((th) => th.text().trim());
    expect(colHeads).toContain('Jul');
    expect(colHeads).not.toContain('Aug');
    // Column + grand total are the sum of SURVIVORS only: 100 + 40 = 140 (the
    // dropped ZEROACC contributes nothing — it would have been 0 anyway, but the
    // point is totals run over the survivor set).
    expect(colTotalTexts(wrapper)[0]).toBe('140');
    expect(grandTotalText(wrapper)).toBe('140');

    // Now make COGS's Aug NON-zero (5). Aug is no longer all-zero across survivors,
    // so the column must SURVIVE — a column drops ONLY when EVERY surviving row is
    // zero there. Totals recompute: Jul 140, Aug 5.
    runTm1Query.mockImplementation(async (payload) => {
      const colMembers = (payload.cols?.[0]?.members || []);
      const cells = (jul, aug) => colMembers.map((cm) => ({
        value: cm === 'Jul' ? jul : cm === 'Aug' ? aug : 0,
        formatted: null,
      }));
      return {
        columns: colMembers.map((m) => [m]),
        rows: [
          { members: ['EXPENSE'], cells: cells(100, 0) },
          { members: ['COGS'], cells: cells(40, 5) },
          { members: ['ZEROACC'], cells: cells(0, 0) },
        ],
        mdx: 'X',
      };
    });
    await setSuppress(wrapper, false);
    await setSuppress(wrapper, true);

    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'COGS']); // ZEROACC still dropped.
    colHeads = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .map((th) => th.text().trim());
    expect(colHeads).toContain('Jul');
    expect(colHeads).toContain('Aug'); // survives — COGS is non-zero there.
    // Column totals over survivors: Jul 140, Aug 5; grand 145.
    expect(colTotalTexts(wrapper)[0]).toBe('140'); // Jul
    expect(colTotalTexts(wrapper)[1]).toBe('5'); //   Aug
    expect(grandTotalText(wrapper)).toBe('145');
  });

  it('after expanding a parent, the column/grand totals still EXCLUDE it and run over survivors', async () => {
    const wrapper = await mountExplorer();

    // Suppress ON. Expand EXPENSE: its children Rent 60 + Salaries 40 show. The
    // EXPANDED parent is excluded from totals (it is represented by its children),
    // and survivors are summed ONE level: Rent 60 + Salaries 40 + COGS 40 = 140,
    // NOT 240 (the parent+children double-count). Aug stays dropped (all-zero).
    await expand(wrapper, 'EXPENSE');
    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'Rent', 'Salaries', 'COGS']);
    expect(colTotalTexts(wrapper)[0]).toBe('140');
    expect(colTotalTexts(wrapper)[0]).not.toBe('240');
    expect(grandTotalText(wrapper)).toBe('140');

    // Aug remains suppressed (no survivor is non-zero there).
    const colHeads = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .map((th) => th.text().trim());
    expect(colHeads).not.toContain('Aug');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 15 — MULTI-DIMENSION ROW DRILL (year OUTER × account INNER)
//
// With two row dims the drill targets the INNERMOST dim's member set across the
// crossjoin: the row-header is one frozen column with one segment per row dim, the
// twisty lives on the INNERMOST (account) segment, and the inner tree is SHARED
// across every outer (year) block — so expanding a consolidation expands it for
// EVERY outer tuple in one action and re-queries. These mount the [year, account,
// month, measure] layout so account is innermost, then drag year onto Rows.
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — multi-dimension row drill', () => {
  it('expanding the inner EXPENSE expands it in EVERY outer (year) block, re-queries; collapse removes it everywhere', async () => {
    const wrapper = await mountExplorerMultiDim();
    await dragYearToRows(wrapper);

    // Two row dims, account innermost. The crossjoin gives one inner block per
    // year: (FY24·EXPENSE),(FY24·COGS),(FY25·EXPENSE),(FY25·COGS). All non-zero in
    // Jul → all survive suppression. There are therefore TWO EXPENSE inner rows.
    expect(rowsByInner(wrapper, 'EXPENSE').length).toBe(2);
    expect(rowsByInner(wrapper, 'COGS').length).toBe(2);

    // The twisty is on the INNER (account) segment, on each EXPENSE row.
    const innerExpense = innerTwistyFor(wrapper, 'EXPENSE');
    expect(innerExpense, 'inner EXPENSE twisty').toBeTruthy();

    const callsBefore = runTm1Query.mock.calls.length;

    // Expand EXPENSE once (click either occurrence's inner twisty). The inner tree
    // is shared, so EXPENSE expands for BOTH year blocks in one action.
    await expandInner(wrapper, 'EXPENSE');

    // Re-queried.
    expect(runTm1Query.mock.calls.length).toBeGreaterThan(callsBefore);

    // EXPENSE's children now appear UNDER EXPENSE in EVERY year block → two Rent +
    // two Salaries rows (one set per year). COGS stays collapsed (still two rows).
    expect(rowsByInner(wrapper, 'Rent').length).toBe(2);
    expect(rowsByInner(wrapper, 'Salaries').length).toBe(2);
    expect(rowsByInner(wrapper, 'EXPENSE').length).toBe(2); // both parents still shown.
    expect(rowsByInner(wrapper, 'COGS').length).toBe(2); //    collapsed in both blocks.

    // Each Rent inner row carries EXPENSE/Rent = 60 (its contextual value), proving
    // the crossjoin de-queued the inner tuples correctly per outer block.
    rowsByInner(wrapper, 'Rent').forEach((tr) => {
      expect(cellTexts(tr)[0]).toBe('60');
    });

    // Collapse EXPENSE → its subtree is removed from EVERY year block.
    await collapseInner(wrapper, 'EXPENSE');
    expect(rowsByInner(wrapper, 'Rent').length).toBe(0);
    expect(rowsByInner(wrapper, 'Salaries').length).toBe(0);
    expect(rowsByInner(wrapper, 'EXPENSE').length).toBe(2); // parents remain, collapsed.
    expect(rowsByInner(wrapper, 'COGS').length).toBe(2);
  });

  it('a duplicated inner member (overlapping rollups) de-queues to its OWN cells per outer block; a backend-dropped inner tuple in one block renders blank without shifting others', async () => {
    const wrapper = await mountExplorerMultiDim();
    await dragYearToRows(wrapper);

    // Expand BOTH inner consolidations so "Rent" appears TWICE per year block (once
    // under EXPENSE = 60, once under COGS = 25). The shared inner tree drives both
    // year blocks identically.
    await expandInner(wrapper, 'EXPENSE');
    await expandInner(wrapper, 'COGS');

    // Per year block the inner order is EXPENSE, Rent(60), Salaries(40), COGS,
    // Rent(25), Materials(15). Across two year blocks there are FOUR Rent rows.
    const rents = rowsByInner(wrapper, 'Rent');
    expect(rents.length).toBe(4);
    // Their contextual values are the two distinct Rent values, repeated per block:
    // [60, 25, 60, 25] — each occurrence de-queued to ITS OWN backend row, never a
    // shared/leaked cell.
    expect(rents.map((tr) => cellTexts(tr)[0])).toEqual(['60', '25', '60', '25']);

    // Now DROP exactly one inner tuple in ONE outer block — (FY24, Salaries) — at
    // the backend, while keeping every other tuple. The dropped node must render
    // BLANK in FY24 and NOT shift any sibling (Rent's de-queue is keyed by member,
    // so it is unaffected), and FY25's Salaries must still carry its value.
    runTm1Query.mockImplementation(async (payload) => {
      const resp = buildMultiDimResponse(payload);
      resp.rows = resp.rows.filter(
        (r) => !(r.members[0] === 'FY24' && r.members[r.members.length - 1] === 'Salaries'),
      );
      return resp;
    });
    // Re-query under the dropped-tuple shape (toggle round-trip; suppress stays ON).
    await setSuppress(wrapper, false);
    await setSuppress(wrapper, true);

    // The grid still renders; collect the Salaries inner rows grouped by their
    // OUTER (year) segment so we can check FY24 vs FY25 independently.
    const salaryRows = rowsByInner(wrapper, 'Salaries');
    const outerOf = (tr) =>
      tr.find('.pivot-grid__row-seg:not(.pivot-grid__row-seg--inner) .pivot-grid__row-label').text();
    const fy24Salary = salaryRows.find((tr) => outerOf(tr) === 'FY24');
    const fy25Salary = salaryRows.find((tr) => outerOf(tr) === 'FY25');

    // FY24's Salaries node still EXISTS structurally (the inner tree is shared) but
    // its backend row was dropped → its data cell is BLANK.
    expect(fy24Salary, 'FY24 Salaries row still present structurally').toBeTruthy();
    expect(cellTexts(fy24Salary)[0]).toBe('');
    // FY25's Salaries is intact (40) — the drop did not shift or blank it.
    expect(fy25Salary, 'FY25 Salaries row present').toBeTruthy();
    expect(cellTexts(fy25Salary)[0]).toBe('40');

    // The two Rent occurrences in FY24 are UNSHIFTED by the dropped Salaries — they
    // still read 60 (EXPENSE/Rent) then 25 (COGS/Rent), proving member-keyed
    // de-queue is robust to a hole elsewhere in the block.
    const fy24Rents = rowsByInner(wrapper, 'Rent').filter((tr) => outerOf(tr) === 'FY24');
    expect(fy24Rents.map((tr) => cellTexts(tr)[0])).toEqual(['60', '25']);
  });

  it('a11y: aria-expanded on the inner twisty toggles; aria-level reflects INNER depth; table is not role=treegrid', async () => {
    const wrapper = await mountExplorerMultiDim();
    await dragYearToRows(wrapper);

    // The table is a plain data table, never a treegrid — even in the multi-dim
    // crossjoin shape.
    const table = wrapper.find('table.pivot-grid');
    expect(table.exists()).toBe(true);
    expect(table.attributes('role')).not.toBe('treegrid');

    // aria-expanded lives on the INNER twisty BUTTON, not on the row.
    const expenseRow = bodyRows(wrapper).find((tr) => innerLabelOf(tr) === 'EXPENSE');
    expect(expenseRow, 'an EXPENSE inner row exists').toBeTruthy();
    expect(expenseRow.attributes('aria-expanded')).toBeUndefined();
    expect(innerTwistyFor(wrapper, 'EXPENSE').attributes('aria-expanded')).toBe('false');

    // aria-level reflects the INNER node's depth: a top inner consolidation is
    // level 0 → aria-level 1 (the outer year segment does not change the row's
    // declared depth — depth tracks the drill hierarchy).
    expect(expenseRow.attributes('aria-level')).toBe('1');

    // Expand EXPENSE → its twisty flips to expanded, and its children sit one level
    // deeper (aria-level 2).
    await expandInner(wrapper, 'EXPENSE');
    expect(innerTwistyFor(wrapper, 'EXPENSE').attributes('aria-expanded')).toBe('true');
    const rentRow = bodyRows(wrapper).find((tr) => innerLabelOf(tr) === 'Rent');
    expect(rentRow, 'a Rent inner row exists after expand').toBeTruthy();
    expect(rentRow.attributes('aria-level')).toBe('2');

    // Collapse → aria-expanded returns to false.
    await collapseInner(wrapper, 'EXPENSE');
    expect(innerTwistyFor(wrapper, 'EXPENSE').attributes('aria-expanded')).toBe('false');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 16 — ALIAS DISPLAY (entity/account UUIDs → human names in the pivot)
//
// Authored by the INDEPENDENT TESTER (author≠tester doctrine, 2026-05-26) to LOCK
// the display-only alias labelling that just landed. The feature relabels row
// headers, the single-col-dim column headers, and the filter pills from the raw
// principal key (e.g. an entity UUID `41ebfa0e-…`, an account leaf `kl_310_…`) to
// a human alias VALUE — WITHOUT ever letting the alias reach the MDX query
// (axisSpec stays on principal keys).
//
// ── The REALISTIC shapes (the bar: production data, not happy-path fixtures) ───
// We add an `entity` dimension whose principal keys are UUIDs and whose `name`
// alias resolves to "Klikk (Pty) Ltd" — the canonical entity case. `entity` is
// neither account- nor month-shaped, so the fuzzy default assignment puts it on
// the FILTER bar (a pill), exercising the filter-pill relabel path with a true
// UUID principal. `account` stays on Rows; its principal members (EXPENSE / COGS /
// Rent / Salaries / Materials — the cube topology keys) are relabelled to
// `kl_310_…`-style account-leaf names via the label map, exercising the row-header
// relabel. `month` stays on Cols (single col dim), exercising the col-header
// relabel. The drill / query engine is the SAME proven fake cube — only the
// network alias surface is overridden per test, so the topology + arithmetic are
// untouched.
//
// Selectors are SEMANTIC / stable-class (no data-test): `.pivot-grid__row-label`
// (text = displayMember, :title = rowSegTitle = the principal when relabelled),
// `th.pivot-grid__col-head` (text = colHeadLabel), `.pivot-pill__member` (filter
// pill, :title = filterPrincipalTitle). The per-dim alias control is now a
// first-class, always-visible inline "· <label> ▾" picker on each filter pill
// (`.pivot-pill__alias`, trigger aria-label "Display label for <dim>: …") and
// each Rows/Columns axis chip (`.pivot-chip__alias`); its menu items render as
// teleported `.km-item` text ("principal name" / "<alias>").
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — alias display (UUID → human name)', () => {
  // The entity UUID principal (a single filter-bar element) and its human alias.
  const ENTITY_UUID = '41ebfa0e-7c2b-4f1a-9d3e-2a6b8c0d1e2f';
  const ENTITY_NAME = 'Klikk (Pty) Ltd';

  // account principal key → its `name`-alias human label (kl_310_… account leaves
  // + readable rollup names). Covers every account member the grid can show so a
  // drill never surfaces an un-mapped key under this alias.
  const ACCOUNT_NAME_LABELS = {
    EXPENSE: 'kl_400_Operating Expenses',
    COGS: 'kl_500_Cost of Sales',
    Rent: 'kl_410_Rent Paid',
    Salaries: 'kl_420_Salaries & Wages',
    Materials: 'kl_510_Raw Materials',
    All_Account: 'kl_000_All Accounts',
  };

  // month principal key → its `name`-alias label (the single-col-dim header case).
  const MONTH_NAME_LABELS = { Jul: 'July 2025', Aug: 'August 2025' };

  // Layer entity onto the shared cube: a single UUID-keyed leaf element so the
  // filter pill seeds to the UUID (topElement → first option; no "All_" prefix so
  // the UUID itself is selected). The base installCubeMocks already returns
  // aliases:['name'] for `account` ONLY — we extend it so `entity` also advertises
  // a `name` alias, and (by default) `month` does NOT (to assert a dim WITHOUT a
  // `name` alias stays on principal in the same render).
  function installEntityElements() {
    const baseElements = getTm1DimensionElements.getMockImplementation();
    getTm1DimensionElements.mockImplementation(async (dimension, hier) => {
      if (dimension === 'entity') return { elements: [{ name: ENTITY_UUID, type: 'N' }] };
      return baseElements(dimension, hier);
    });
    const baseChildren = getTm1DimensionChildren.getMockImplementation();
    getTm1DimensionChildren.mockImplementation(async (dimension, parent, hier) => {
      if (dimension === 'entity') return { children: [] };
      return baseChildren(dimension, parent, hier);
    });
  }

  // Which dims advertise a `name` alias. entity + account = yes; month = no by
  // default (so the "no name alias → stays principal" arm is observable). Per-test
  // callers can widen this (e.g. add month) before mounting.
  function installAliasLists(withName = ['account', 'entity']) {
    getTm1DimensionAliases.mockImplementation(async (dimension) => ({
      dimension,
      aliases: withName.includes(dimension) ? ['name'] : [],
    }));
  }

  // The label resolver for the entity+account world. Returns ONLY the requested
  // members (mirrors the real per-shown-member fetch) so a test asserting the
  // request shape (`want`) sees the component asking for exactly its shown set.
  function installLabelMap({ account = ACCOUNT_NAME_LABELS, entity = { [ENTITY_UUID]: ENTITY_NAME }, month = {} } = {}) {
    const FULL = { account, entity, month };
    getTm1ElementLabels.mockImplementation(async (dimension, alias, elements) => {
      const all = FULL[dimension] || {};
      const labels = {};
      for (const m of elements || Object.keys(all)) {
        if (all[m] != null) labels[m] = all[m];
      }
      return { dimension, alias, labels };
    });
  }

  // Mount the 4-dim entity layout (account Rows, entity Filter pill, month Cols,
  // measure Filter). attachTo:body so the teleported chip / context menus render.
  async function mountEntityPivot() {
    installCubeMocks({ dimensions: ['account', 'entity', 'month', 'measure'] });
    installEntityElements();
    installAliasLists();
    installLabelMap();
    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();
    return wrapper;
  }

  // The filter pill's rendered MEMBER text for a dim (displayMember output).
  function pillMemberText(wrapper, dim) {
    const pill = wrapper
      .findAll('.pivot-pill')
      .find((p) => (p.attributes('aria-label') || '').startsWith(`${dim}:`));
    return pill ? pill.find('.pivot-pill__member') : undefined;
  }

  // The col-head <th> elements' trimmed text, EXCLUDING the trailing Total header.
  function dataColHeadTexts(wrapper) {
    return wrapper
      .findAll('thead th.pivot-grid__col-head:not(.pivot-grid__total-head)')
      .map((th) => th.text().trim());
  }

  // The teleported chip-menu / context-menu item whose text === label.
  function bodyMenuItem(label) {
    return [...document.body.querySelectorAll('.km-item')].find(
      (el) => el.textContent.trim() === label,
    );
  }

  // ── Auto-default ────────────────────────────────────────────────────────────
  it('auto-defaults a dim with a `name` alias: row/col/filter members relabel to the alias, principal kept in title; a dim WITHOUT `name` stays on principal', async () => {
    // entity + account advertise `name`; month does NOT (default list). So account
    // rows + the entity pill relabel; the month col headers stay on principal.
    const wrapper = await mountEntityPivot();

    // Sanity: the layout landed as designed (account on Rows, entity a Filter pill).
    expect(chipMap(wrapper)).toContain('rows:account');
    expect(pillMemberText(wrapper, 'entity'), 'entity is a filter pill').toBeTruthy();

    // ROW HEADERS: the account rollups relabelled to their kl_… alias values (NOT
    // the raw EXPENSE / COGS principal keys). The grid auto-resolved `name` with
    // zero clicks.
    const labels = rowLabels(wrapper);
    expect(labels).toContain('kl_400_Operating Expenses');
    expect(labels).toContain('kl_500_Cost of Sales');
    expect(labels).not.toContain('EXPENSE');
    expect(labels).not.toContain('COGS');

    // The PRINCIPAL key is still discoverable as the row-segment :title (the UUID /
    // code stays reachable for audit) — load-bearing statutory-style affordance.
    const expenseSeg = bodyRows(wrapper)
      .flatMap((tr) => tr.findAll('.pivot-grid__row-label'))
      .find((s) => s.text() === 'kl_400_Operating Expenses');
    expect(expenseSeg.attributes('title')).toBe('EXPENSE');

    // FILTER PILL: the entity UUID relabelled to the human name; its :title carries
    // the raw UUID principal.
    const pill = pillMemberText(wrapper, 'entity');
    expect(pill.text()).toBe(ENTITY_NAME);
    expect(pill.attributes('title')).toBe(ENTITY_UUID);

    // COL HEADERS: month has NO `name` alias → its members stay on the raw principal
    // keys (Jul / Aug), proving the auto-default is per-dim, not global. (Aug is
    // suppressed by default, so assert Jul is present and is the principal key.)
    const colHeads = dataColHeadTexts(wrapper);
    expect(colHeads).toContain('Jul');
    expect(colHeads).not.toContain('July 2025');
    // And the month col-head carries NO principal :title (nothing was relabelled).
    const julHead = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .find((th) => th.text().trim() === 'Jul');
    expect(julHead.attributes('title')).toBeUndefined();
  });

  it('a single-col-dim WITH a `name` alias relabels its column headers (Jul → "July 2025") with the principal in the header title', async () => {
    // Widen the alias list so month ALSO advertises `name`, and give it a label map.
    installCubeMocks({ dimensions: ['account', 'entity', 'month', 'measure'] });
    installEntityElements();
    installAliasLists(['account', 'entity', 'month']);
    installLabelMap({ month: MONTH_NAME_LABELS });
    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();
    // Suppress OFF so BOTH month columns (incl. the all-zero Aug) are visible to
    // assert the full relabel, not just the surviving column.
    await setSuppress(wrapper, false);

    const colHeads = dataColHeadTexts(wrapper);
    expect(colHeads).toContain('July 2025');
    expect(colHeads).toContain('August 2025');
    expect(colHeads).not.toContain('Jul');

    // The principal month key is the col-head :title.
    const julyHead = wrapper
      .findAll('thead th.pivot-grid__col-head')
      .find((th) => th.text().trim() === 'July 2025');
    expect(julyHead.attributes('title')).toBe('Jul');
  });

  // ── Fallback (sparse / blank / rejecting label endpoint) ──────────────────────
  it('falls back to the principal key when getTm1ElementLabels returns a SPARSE/blank map — no throw, grid still renders', async () => {
    installCubeMocks({ dimensions: ['account', 'entity', 'month', 'measure'] });
    installEntityElements();
    installAliasLists();
    // SPARSE: only EXPENSE resolves; COGS is MISSING and Rent is BLANK ('').
    getTm1ElementLabels.mockImplementation(async (dimension, alias, elements) => {
      if (dimension === 'account') {
        const labels = {};
        for (const m of elements || []) {
          if (m === 'EXPENSE') labels[m] = 'kl_400_Operating Expenses';
          else if (m === 'Rent') labels[m] = ''; // blank → must fall back to key
          // COGS deliberately omitted → must fall back to key
        }
        return { dimension, alias, labels };
      }
      if (dimension === 'entity') return { dimension, alias, labels: {} }; // blank entity
      return { dimension, alias, labels: {} };
    });
    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();

    const labels = rowLabels(wrapper);
    // The resolved member shows its alias label; the missing one falls back to its
    // raw principal key — both render, neither throws.
    expect(labels).toContain('kl_400_Operating Expenses'); // resolved
    expect(labels).toContain('COGS'); //                      missing → principal key

    // Blank entity label → the pill falls back to the raw UUID principal.
    expect(pillMemberText(wrapper, 'entity').text()).toBe(ENTITY_UUID);

    // The grid is intact (rows present) — a sparse map degraded gracefully.
    expect(bodyRows(wrapper).length).toBeGreaterThan(0);

    // Drill EXPENSE: its blank-labelled leaf Rent falls back to the principal key,
    // its mapped sibling stays principal too (Salaries was never mapped). No throw.
    await expand(wrapper, 'kl_400_Operating Expenses');
    const afterDrill = rowLabels(wrapper);
    expect(afterDrill).toContain('Rent'); //     blank '' → key
    expect(afterDrill).toContain('Salaries'); // unmapped → key
    expect(bodyRows(wrapper).length).toBeGreaterThan(1);
  });

  it('falls back to the principal key when getTm1ElementLabels REJECTS — no unhandled throw, members render as keys', async () => {
    installCubeMocks({ dimensions: ['account', 'entity', 'month', 'measure'] });
    installEntityElements();
    installAliasLists();
    // The label endpoint hard-fails for every dim.
    getTm1ElementLabels.mockRejectedValue(new Error('TM1 element-labels 503'));
    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();

    // Auto-default still SET `name` (the alias LIST resolved fine), but label
    // resolution failed → every shown member falls back to its principal key.
    const labels = rowLabels(wrapper);
    expect(labels).toContain('EXPENSE');
    expect(labels).toContain('COGS');
    expect(pillMemberText(wrapper, 'entity').text()).toBe(ENTITY_UUID);

    // The grid rendered (the rejection did not bubble out of the fire-and-forget
    // resolve and break the render).
    expect(wrapper.find('table.pivot-grid').exists()).toBe(true);
    expect(bodyRows(wrapper).length).toBeGreaterThan(0);
  });

  // ── Per-dim control: CHIP inline alias picker ─────────────────────────────────
  // Realigned 2026-06-09: alias selection moved OUT of the chip's kebab move-menu
  // into a first-class, always-visible inline "· <label> ▾" control on the chip
  // (PAW-style). The control is its own controlled KMenu, driven by the chip's
  // `aliasOpen` prop / `toggle-alias` emit; its items now read "name" / "principal
  // name" (no "Label:" prefix). The LOCKED behaviours (revert-to-key, re-apply,
  // active check, display-only) are unchanged — only the control's home + labels.
  it('chip inline picker: "principal name" reverts the row headers to the raw key; "name" re-applies the alias; the active item carries the check', async () => {
    const wrapper = await mountEntityPivot();
    // Auto-defaulted: rows show the kl_… alias.
    expect(rowLabels(wrapper)).toContain('kl_400_Operating Expenses');

    const accountChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');
    expect(accountChip, 'account row chip should exist').toBeTruthy();
    // The chip received the alias list + active alias from the parent (auto-default).
    expect(accountChip.props('aliases')).toEqual(['name']);
    expect(accountChip.props('activeAlias')).toBe('name');

    // Open the chip's INLINE alias menu via its real contract (the toggle-alias
    // emit the inline control's KMenu fires) → its items teleport into <body>. The
    // ACTIVE alias item carries the check icon (km-item__icon present); principal
    // does not.
    accountChip.vm.$emit('toggle-alias', true);
    await settle();
    const nameItem = bodyMenuItem('name');
    const principalItem = bodyMenuItem('principal name');
    expect(nameItem, '"name" item should render').toBeTruthy();
    expect(principalItem, '"principal name" item should render').toBeTruthy();
    expect(nameItem.querySelector('.km-item__icon'), 'active alias carries the check').toBeTruthy();
    expect(principalItem.querySelector('.km-item__icon')).toBeFalsy();

    // Click "principal name" → reverts the rows to the raw principal keys.
    principalItem.dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
    expect(rowLabels(wrapper)).toContain('EXPENSE');
    expect(rowLabels(wrapper)).not.toContain('kl_400_Operating Expenses');
    // The chip now reflects principal as active.
    expect(accountChip.props('activeAlias')).toBe('');

    // Re-open + click "name" → re-applies the alias.
    accountChip.vm.$emit('toggle-alias', true);
    await settle();
    bodyMenuItem('name').dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
    expect(rowLabels(wrapper)).toContain('kl_400_Operating Expenses');
    expect(rowLabels(wrapper)).not.toContain('EXPENSE');
    expect(accountChip.props('activeAlias')).toBe('name');
  });

  it('chip menu: choosing an alias emits `alias` from the chip and is display-only — the runTm1Query payload is unchanged', async () => {
    const wrapper = await mountEntityPivot();
    const accountChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');

    // Snapshot the LAST query payload BEFORE the alias flip.
    const payloadBefore = runTm1Query.mock.calls.at(-1)[0];
    const callsBefore = runTm1Query.mock.calls.length;

    // Flip to principal via the chip's REAL emit contract (what the menu item fires).
    accountChip.vm.$emit('alias', '');
    await settle();
    // …and back to name.
    accountChip.vm.$emit('alias', 'name');
    await settle();

    // The rendered label changed (display happened)…
    expect(rowLabels(wrapper)).toContain('kl_400_Operating Expenses');
    // …but NO query was issued by the alias change (display-only) and the latest
    // payload is byte-identical to the pre-flip one — the alias never reached MDX.
    expect(runTm1Query.mock.calls.length).toBe(callsBefore);
    expect(runTm1Query.mock.calls.at(-1)[0]).toEqual(payloadBefore);
  });

  // ── Inline alias control DISCOVERABILITY (author smoke — NOT full coverage) ───
  // Minimal mount-based smoke for the new first-class inline "· <label> ▾" control
  // the feature added (per author≠tester, this is presence/discoverability only;
  // the independent tester owns the comprehensive round-trip + entity→code +
  // suppress/drill/nested-cols-intact coverage). It asserts (1) the control is
  // ALWAYS visible (not buried in a kebab) on a filter pill AND a row chip for a
  // dim WITH aliases, showing the active label, and (2) a dim WITHOUT aliases
  // renders NO inline control. The relabel BEHAVIOUR is locked by the two
  // realigned per-dim tests below + the auto-default test above.
  it('inline alias control: a dim WITH aliases shows an always-visible "· <label> ▾" affordance on its pill + chip; a dim WITHOUT aliases shows none', async () => {
    // account + entity advertise `name`; month does NOT (the default alias list).
    const wrapper = await mountEntityPivot();

    // (1a) The entity FILTER pill carries the inline alias trigger (aria-label
    // "Display label for entity: …"), showing the active alias name inline.
    const entityAliasBtn = wrapper
      .findAll('.pivot-pill__alias')
      .find((b) => (b.attributes('aria-label') || '').startsWith('Display label for entity'));
    expect(entityAliasBtn, 'entity pill has an inline alias control').toBeTruthy();
    expect(entityAliasBtn.find('.pivot-pill__alias-name').text()).toBe('name');

    // (1b) The account ROW chip carries the inline alias trigger too (the chip
    // renders .pivot-chip__alias when it has aliases; auto-defaulted to `name`).
    const accountChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');
    const chipAliasBtn = accountChip.find('.pivot-chip__alias');
    expect(chipAliasBtn.exists(), 'account chip has an inline alias control').toBe(true);
    expect(chipAliasBtn.find('.pivot-chip__alias-name').text()).toBe('name');

    // (2) The month COLUMN chip has NO `name` alias (empty list) → NO inline
    // control rendered (the affordance only appears when there's something to pick).
    const monthChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'cols' && c.props('dim') === 'month');
    expect(monthChip, 'month is a column chip').toBeTruthy();
    expect(monthChip.props('aliases')).toEqual([]);
    expect(monthChip.find('.pivot-chip__alias').exists(), 'no inline control without aliases').toBe(false);
  });

  // ── Per-dim control: CONTEXT-PILL inline alias picker ─────────────────────────
  // Realigned 2026-06-09: alias selection moved OUT of the entity pill's kebab
  // move-menu into a first-class, always-visible inline "· <label> ▾" control on
  // the pill itself (its own controlled KMenu, trigger aria-label "Display label
  // for entity: …"). Items now read "name" / "principal name" (no "Label:"
  // prefix). The move-menu is movement-only now. Locked behaviour (flip to
  // principal → UUID; re-apply → human name; active check) unchanged.
  it('context-pill inline picker: the entity pill exposes "name"/"principal name"; flipping to principal shows the UUID, re-applying shows the human name', async () => {
    const wrapper = await mountEntityPivot();
    // entity pill auto-defaulted to the human name.
    expect(pillMemberText(wrapper, 'entity').text()).toBe(ENTITY_NAME);

    // The entity pill's INLINE alias menu (trigger aria-label "Display label for
    // entity: …") holds principal + every alias. Open it (controlled).
    const aliasMenu = wrapper
      .findAllComponents(KMenu)
      .find((m) => m.html().includes('Display label for entity'));
    expect(aliasMenu, 'entity inline alias menu should exist').toBeTruthy();
    aliasMenu.vm.$emit('update:modelValue', true);
    await settle();

    const principalItem = bodyMenuItem('principal name');
    const nameItem = bodyMenuItem('name');
    expect(principalItem, 'context "principal name" item').toBeTruthy();
    expect(nameItem, 'context "name" item').toBeTruthy();
    // Active alias (name) carries the check; principal does not.
    expect(nameItem.querySelector('.km-item__icon')).toBeTruthy();
    expect(principalItem.querySelector('.km-item__icon')).toBeFalsy();

    // Click "principal name" → the pill shows the raw UUID.
    principalItem.dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
    expect(pillMemberText(wrapper, 'entity').text()).toBe(ENTITY_UUID);

    // Re-open + "name" → back to the human name.
    aliasMenu.vm.$emit('update:modelValue', true);
    await settle();
    bodyMenuItem('name').dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
    expect(pillMemberText(wrapper, 'entity').text()).toBe(ENTITY_NAME);
  });

  // ── Stale-guard (late label reply for a superseded alias is dropped) ──────────
  it('stale-guard: switching a dim\'s alias while a label fetch is IN FLIGHT drops the late reply (members reflect the LATEST alias, not the stale one)', async () => {
    // Build a layout where account has TWO aliases (name + code) so we can switch
    // between two non-principal aliases and prove the LATE one wins, not the slow
    // earlier one. We hand-roll the label endpoint to DEFER the first (name) reply.
    installCubeMocks({ dimensions: ['account', 'entity', 'month', 'measure'] });
    installEntityElements();
    getTm1DimensionAliases.mockImplementation(async (dimension) => {
      if (dimension === 'account') return { dimension, aliases: ['name', 'code'] };
      if (dimension === 'entity') return { dimension, aliases: ['name'] };
      return { dimension, aliases: [] };
    });

    // A deferred gate for the `name` alias account fetch (the auto-default fires it
    // on mount). `code` resolves SYNCHRONOUSLY. We hold `name` open, switch to
    // `code`, let `code` land, THEN release the stale `name` reply.
    let releaseName;
    const nameGate = new Promise((res) => {
      releaseName = res;
    });
    getTm1ElementLabels.mockImplementation(async (dimension, alias, elements) => {
      if (dimension === 'account' && alias === 'name') {
        await nameGate; // held open until the test releases it
        const labels = {};
        for (const m of elements || []) labels[m] = `NAME_${m}`;
        return { dimension, alias, labels };
      }
      if (dimension === 'account' && alias === 'code') {
        const labels = {};
        for (const m of elements || []) labels[m] = `CODE_${m}`;
        return { dimension, alias, labels };
      }
      if (dimension === 'entity') return { dimension, alias, labels: { [ENTITY_UUID]: ENTITY_NAME } };
      return { dimension, alias, labels: {} };
    });

    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();

    // The `name` reply is still gated → rows show the raw principal keys (no label
    // resolved yet for account).
    expect(rowLabels(wrapper)).toContain('EXPENSE');
    expect(rowLabels(wrapper)).not.toContain('NAME_EXPENSE');

    // Switch account → `code` via the chip emit. This bumps aliasSeq + clears the
    // label cache, and `code` resolves synchronously on the next settle.
    const accountChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');
    accountChip.vm.$emit('alias', 'code');
    await settle();

    // `code` landed: rows show CODE_*.
    expect(rowLabels(wrapper)).toContain('CODE_EXPENSE');

    // NOW release the stale `name` reply (the alias the user already moved off of).
    releaseName();
    await settle();

    // The stale `name` reply must NOT apply — rows STILL reflect `code`, never the
    // late `name` labels (aliasSeq + alias-change guard dropped it).
    expect(rowLabels(wrapper)).toContain('CODE_EXPENSE');
    expect(rowLabels(wrapper)).not.toContain('NAME_EXPENSE');
    expect(accountChip.props('activeAlias')).toBe('code');
  });

  it('stale-guard (aliasSeq specifically): a clear-then-RESELECT of the SAME alias drops an in-flight reply with a SUPERSEDED seq token, not via the alias-name check', async () => {
    // This isolates the aliasSeq token. We HANG the very first account `name` fetch
    // and tag it STALE; every later `name` fetch resolves immediately tagged FRESH.
    // After a round-trip (name → principal → name) the dim is on `name` AGAIN, so
    // the alias-NAME guard `dimAlias[dim] !== alias` does NOT fire when the held
    // STALE reply finally lands — only the bumped aliasSeq distinguishes it. NB:
    // ensureAliasLabels does not de-dupe an identical in-flight request, so the
    // grid may already show FRESH before the round-trip; the load-bearing claim is
    // simply that releasing the STALE reply never clobbers FRESH.
    installCubeMocks({ dimensions: ['account', 'entity', 'month', 'measure'] });
    installEntityElements();
    installAliasLists();

    let firstSeen = false;
    let releaseFirst;
    const firstGate = new Promise((res) => {
      releaseFirst = res;
    });
    getTm1ElementLabels.mockImplementation(async (dimension, alias, elements) => {
      if (dimension === 'account' && alias === 'name') {
        const isFirst = !firstSeen;
        firstSeen = true;
        if (isFirst) await firstGate; // hang ONLY the original in-flight fetch
        const tag = isFirst ? 'STALE' : 'FRESH';
        const labels = {};
        for (const m of elements || []) labels[m] = `${tag}_${m}`;
        return { dimension, alias, labels };
      }
      if (dimension === 'entity') return { dimension, alias, labels: { [ENTITY_UUID]: ENTITY_NAME } };
      return { dimension, alias, labels: {} };
    });

    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();

    const accountChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');

    // Round-trip the SAME alias: name → principal → name. Each transition bumps
    // aliasSeq, so the originally-captured seq (held in the gated STALE fetch) is
    // now superseded. The reselect's FRESH fetch resolves immediately.
    accountChip.vm.$emit('alias', ''); // → principal (bump)
    await settle();
    accountChip.vm.$emit('alias', 'name'); // → name again (bump), fresh fetch
    await settle();
    expect(rowLabels(wrapper)).toContain('FRESH_EXPENSE');

    // Release the ORIGINAL (STALE) in-flight reply. It carries alias 'name' — which
    // EQUALS the current dimAlias — so ONLY the seq token can reject it.
    releaseFirst();
    await settle();

    // The fresh labels MUST stand; the stale reply is dropped by the seq guard.
    expect(rowLabels(wrapper)).toContain('FRESH_EXPENSE');
    expect(rowLabels(wrapper)).not.toContain('STALE_EXPENSE');
  });

  // ── Set Editor carry-through ──────────────────────────────────────────────────
  it('Set Editor carry-through: emitting `apply` with alias:"name" sets the grid\'s dimAlias so that dim relabels (and apply with alias:null reverts to principal)', async () => {
    const wrapper = await mountEntityPivot();
    const editor = () => wrapper.findComponent(SetEditor);

    // Open the Set Editor for the account Rows dim via its REAL chip menu.
    const accountChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');
    accountChip.findComponent(KMenu).vm.$emit('update:modelValue', true);
    await settle();
    bodyMenuItem('Edit set…').dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
    expect(editor().exists(), 'editor mounted').toBe(true);

    // First, FORCE the dim onto principal so the carry-through change is observable
    // (auto-default already put it on `name`). Then apply with alias:'name' from the
    // editor and assert the grid relabels.
    accountChip.vm.$emit('alias', '');
    await settle();
    expect(rowLabels(wrapper)).toContain('EXPENSE');

    // Apply EXPENSE with alias:'name' (a non-zero rollup → survives suppression).
    editor().vm.$emit('apply', {
      dimension: 'account',
      hierarchy: null,
      members: ['EXPENSE'],
      types: { EXPENSE: 'C' },
      alias: 'name',
    });
    await settle();

    // The grid relabelled the applied member to its `name` alias value — the editor
    // alias carried through to dimAlias[account].
    expect(rowLabels(wrapper)).toEqual(['kl_400_Operating Expenses']);
    expect(accountChip.props('activeAlias')).toBe('name');

    // Re-open + apply with alias:null → reverts to principal.
    accountChip.findComponent(KMenu).vm.$emit('update:modelValue', true);
    await settle();
    bodyMenuItem('Edit set…').dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
    editor().vm.$emit('apply', {
      dimension: 'account',
      hierarchy: null,
      members: ['EXPENSE'],
      types: { EXPENSE: 'C' },
      alias: null,
    });
    await settle();
    expect(rowLabels(wrapper)).toEqual(['EXPENSE']);
    expect(accountChip.props('activeAlias')).toBe('');

    // Close the editor cleanly before teardown (teleport-unmount hygiene).
    if (editor().exists()) {
      editor().vm.$emit('update:modelValue', false);
      await settle();
    }
  });

  // ── MDX INVARIANT (load-bearing): the alias NEVER reaches the query ───────────
  it('MDX invariant: the runTm1Query payload AND the "Show MDX" text are IDENTICAL whether the dim is on principal or on `name` — the alias never reaches the query', async () => {
    // Make the mock's MDX DEPEND on the requested members so that IF an alias ever
    // leaked into axisSpec.members, the MDX string (and the payload) would visibly
    // differ — turning a silent leak into a hard assertion failure.
    installCubeMocks({ dimensions: ['account', 'entity', 'month', 'measure'] });
    installEntityElements();
    installAliasLists();
    installLabelMap();
    runTm1Query.mockImplementation(async (payload) => {
      const resp = buildQueryResponse(payload);
      const rowMembers = (payload.rows || []).flatMap((r) => r.members || []);
      const colMembers = (payload.cols || []).flatMap((c) => c.members || []);
      resp.mdx =
        `SELECT {${colMembers.join(',')}} ON COLUMNS, ` +
        `{${rowMembers.join(',')}} ON ROWS FROM [${payload.cube}]`;
      return resp;
    });
    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();

    // Open the MDX disclosure (semantic: the toggle button text).
    const mdxToggle = wrapper
      .findAll('button')
      .find((b) => ['Show MDX', 'Hide MDX'].includes(b.text().trim()));
    expect(mdxToggle, 'MDX disclosure toggle should render').toBeTruthy();
    if (mdxToggle.text().trim() === 'Show MDX') {
      await mdxToggle.trigger('click');
      await settle();
    }
    const mdxEl = () => wrapper.find('#pivot-mdx-body');

    // Capture the state with account on `name` (auto-defaulted) — the rows show the
    // kl_… alias, proving display IS relabelled here.
    expect(rowLabels(wrapper)).toContain('kl_400_Operating Expenses');
    const payloadAliased = runTm1Query.mock.calls.at(-1)[0];
    const mdxAliased = mdxEl().text();
    // The MDX uses the PRINCIPAL keys even though the DISPLAY shows aliases.
    expect(mdxAliased).toContain('EXPENSE');
    expect(mdxAliased).not.toContain('kl_400_Operating Expenses');

    // Flip account to PRINCIPAL via the chip. Display reverts to raw keys.
    const accountChip = wrapper
      .findAllComponents(PivotAxisChip)
      .find((c) => c.props('axis') === 'rows' && c.props('dim') === 'account');
    accountChip.vm.$emit('alias', '');
    await settle();
    expect(rowLabels(wrapper)).toContain('EXPENSE');

    // The alias flip issued NO new query (display-only) — so to compare the QUERY
    // for the same SELECTION on principal vs alias we re-run the query explicitly
    // via a state change that DOES re-query but does NOT alter the selection: a
    // suppress round-trip (off→on) returns the layout to its starting selection.
    await setSuppress(wrapper, false);
    await setSuppress(wrapper, true);
    const payloadPrincipal = runTm1Query.mock.calls.at(-1)[0];
    const mdxPrincipal = mdxEl().text();

    // THE INVARIANT: same selection, same query — the alias choice did not change
    // the payload NOR the MDX text. Both are byte-identical across the alias flip.
    expect(payloadPrincipal).toEqual(payloadAliased);
    expect(mdxPrincipal).toBe(mdxAliased);
    // And specifically: the account row axis carries PRINCIPAL keys in BOTH.
    const axisOf = (p) => p.rows.find((r) => r.dimension === 'account').members;
    expect(axisOf(payloadAliased)).toEqual(['EXPENSE', 'COGS']);
    expect(axisOf(payloadPrincipal)).toEqual(['EXPENSE', 'COGS']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NESTED COLUMNS — Step-1 SMOKE (feature-author minimal; the comprehensive
// mount-based coverage is owned by the INDEPENDENT tester per the authorship
// split). This locks ONLY that the nested-column band wires end-to-end: a real
// two-col-dim colAxis envelope (year › month) renders a SPANNING <thead> band
// (year cells spanning their months) over the drilled account rows — not a flat
// "FY24 / Jul" string row. Anything deeper (suppression interaction with the
// band, multi-dim alias relabel across the band, ragged spans, span arithmetic
// under partial suppression) is the tester's surface — see the seams in the report.
// ════════════════════════════════════════════════════════════════════════════
describe('PivotExplorer — nested columns (Step 1 smoke)', () => {
  // A genuine 2-col-dim crossjoin response: colAxis.dimensions = [year, month]
  // (declaration order — see colDims), tuples = the leaf crossjoin in outer
  // (year) slowest / inner (month) fastest order, cells aligned to that order.
  function build2ColResponse(payload) {
    const rowDims = payload.rows || [];
    const cols = payload.cols || [];
    // colDims arrive in dimension-declaration order; with [account,year,month,
    // measure] that is [year, month] once year joins month on the axis.
    const colMemberLists = cols.map((c) => c.members || []);
    // Leaf tuples = crossjoin, outer-slowest. matches the engine's _axis_set.
    const tuples = colMemberLists.reduce(
      (acc, list) => acc.flatMap((t) => list.map((m) => [...t, m])),
      [[]],
    );
    const cellsFor = (scalar) => tuples.map(() => ({ value: scalar, formatted: null }));
    // Single row dim (account) — walk the flat member list like the hero path.
    let scope = null;
    const rows = (rowDims[0]?.members || []).map((member) => {
      const { value, scope: next } = leafValueFor(member, scope);
      scope = next;
      return { members: [member], cells: cellsFor(value) };
    });
    return {
      columns: tuples.map((t) => t.slice()), // legacy flat (multi-member tuples)
      rows,
      colAxis: { dimensions: cols.map((c) => c.dimension), tuples },
      rowAxis: { dimensions: rowDims.map((d) => d.dimension), tuples: rows.map((r) => r.members.slice()) },
      mdx: `SELECT FROM [${payload.cube}]`,
    };
  }

  async function mountTwoColDim() {
    installCubeMocks({ dimensions: ['account', 'year', 'month', 'measure'] });
    // Single col dim before the drag (month) uses the hero builder; once year
    // joins (2 col dims) the 2-col builder produces the nested envelope.
    runTm1Query.mockImplementation(async (payload) =>
      (payload.cols || []).length > 1 ? build2ColResponse(payload) : buildQueryResponse(payload),
    );
    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();
    // Drag the `year` filter pill onto the COLUMNS well → colDims [year, month].
    const dt = makeDataTransfer('year');
    const colsWell = zone(wrapper, 'cols');
    fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
    fireDrag(colsWell.element, 'dragover', { dataTransfer: dt });
    fireDrag(colsWell.element, 'drop', { dataTransfer: dt });
    await settle();
    return wrapper;
  }

  it('renders a nested SPANNING band: two thead rows, year cells span their months, innermost row carries the month leaves', async () => {
    const wrapper = await mountTwoColDim();

    // Layout: account on Rows, year + month BOTH on Cols.
    expect(chipMap(wrapper)).toContain('rows:account');
    expect(chipMap(wrapper)).toContain('cols:year');
    expect(chipMap(wrapper)).toContain('cols:month');

    // TWO band rows (one per col dim) — decisively NOT one flat row.
    const bandRows = wrapper.findAll('thead tr.pivot-grid__col-band-row');
    expect(bandRows.length).toBe(2);

    // OUTER row = year group cells; each spans its 2 month leaves (colspan=2).
    const groupCells = wrapper.findAll('thead th.pivot-grid__col-group');
    expect(groupCells.length).toBe(2); // FY24, FY25
    const groupTexts = groupCells.map((th) => th.text().trim());
    expect(groupTexts).toContain('FY24');
    expect(groupTexts).toContain('FY25');
    groupCells.forEach((th) => expect(th.attributes('colspan')).toBe('2'));

    // INNERMOST row = month leaves the cells align to; they keep the legacy
    // col-head class so cell-alignment / alias / total contracts are intact.
    const leafHeads = wrapper
      .findAll('thead th.pivot-grid__col-head:not(.pivot-grid__total-head)')
      .map((th) => th.text().trim());
    // Suppress is ON by default; Aug is all-zero (colFactor 0) so it is dropped —
    // BUT every FY block keeps Jul, so the surviving leaves are FY24/Jul + FY25/Jul.
    expect(leafHeads.filter((t) => t === 'Jul').length).toBeGreaterThanOrEqual(1);

    // CORNER spans the full band depth (rowspan = 2) and sits once.
    const corner = wrapper.findAll('thead th.pivot-grid__corner');
    expect(corner.length).toBe(1);
    expect(corner[0].attributes('rowspan')).toBe('2');

    // TOTAL head spans the full band depth too (rowspan = 2), rendered once.
    const totalHeads = wrapper.findAll('thead th.pivot-grid__total-head');
    expect(totalHeads.length).toBe(1);
    expect(totalHeads[0].attributes('rowspan')).toBe('2');
  });

  it('suppress OFF: the FULL nested grid renders (FY24/FY25 × Jul/Aug = 4 leaves) with the body intact', async () => {
    const wrapper = await mountTwoColDim();
    await setSuppress(wrapper, false);

    // 4 leaf columns now survive (no suppression): FY24/Jul, FY24/Aug, FY25/Jul, FY25/Aug.
    const leafHeads = wrapper.findAll('thead th.pivot-grid__col-head:not(.pivot-grid__total-head)');
    expect(leafHeads.length).toBe(4);
    // Each year group now spans 2 months across the full band.
    const groupCells = wrapper.findAll('thead th.pivot-grid__col-group');
    groupCells.forEach((th) => expect(th.attributes('colspan')).toBe('2'));

    // The body rendered real account rows under the nested band (drillable EXPENSE
    // present) — the band did not break the row render.
    expect(rowLabels(wrapper)).toContain('EXPENSE');
    expect(wrapper.find('tfoot').exists()).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NESTED COLUMNS — INDEPENDENT-TESTER DEEP COVERAGE (author≠tester, 2026-05-26
// doctrine). The author shipped a Step-1 SMOKE above (band wires end-to-end);
// this block locks the FIVE seams the author flagged as deliberately uncovered
// PLUS the single-col-dim invariant the existing suites + alias logic rely on.
//
// Bar (per the KTable incident): MOUNT the REAL consumer (PivotExplorer + its
// real KDL children), feed the REALISTIC nested-column envelope shape the LIVE
// backend now returns (architect ARCHITECTURE-AND-ROADMAP.md §1.1: colAxis =
// {dimensions:[…outer→inner], tuples:[[…],…]}, cells row-major ri*ncols+ci),
// and assert OBSERVABLE DOM (band <tr> count, group colspans, leaf headers,
// data-cell alignment, totals, :title). Selectors are STABLE classes only.
//
// ── The flexible nested-column builder ───────────────────────────────────────
// The author's build2ColResponse hard-wires a single scalar per row across every
// leaf. The seam tests need per-(row,leaf) control (ragged suppression, cell-to-
// leaf alignment), 3-deep crossjoins, and an alias world — so this builder takes
// a `valueAt(rowMember, leafTuple)` and is parametric in the column dims. The
// crossjoin is built OUTER-SLOWEST / inner-fastest (the engine's _axis_set order,
// §1.1) and cells are emitted in that exact leaf order — so a test that asserts a
// cell lands under a leaf is locking the colAxis.tuples↔row.cells order contract.
function buildNestedColResponse(payload, valueAt) {
  const rowDims = payload.rows || [];
  const cols = payload.cols || [];
  const colMemberLists = cols.map((c) => c.members || []);
  const tuples = colMemberLists.reduce(
    (acc, list) => acc.flatMap((t) => list.map((m) => [...t, m])),
    [[]],
  );
  // Single row dim (account) — the drillable hero path; one row per requested
  // member, cells in leaf-tuple order. valueAt decides each (rowMember, tuple)
  // cell so a test can zero a SPECIFIC leaf under a SPECIFIC year.
  const rows = (rowDims[0]?.members || []).map((member) => ({
    members: [member],
    cells: tuples.map((t) => ({ value: valueAt(member, t), formatted: null })),
  }));
  return {
    columns: tuples.map((t) => t.slice()),
    rows,
    colAxis: { dimensions: cols.map((c) => c.dimension), tuples },
    rowAxis: {
      dimensions: rowDims.map((d) => d.dimension),
      tuples: rows.map((r) => r.members.slice()),
    },
    mdx: `SELECT FROM [${payload.cube}]`,
  };
}

// Mount a layout where `extra` dims join `month` on the COLUMNS axis via the
// proven drag WIRING, with runTm1Query driven by a per-test `valueAt`. Declaration
// order fixes the band order: dimensions:[account, ...extra, month] → colDims in
// that order once each extra is dragged across (month stays innermost). Before any
// drag the single-col-dim hero builder runs (auto-open grid identical to the base
// suites); once >1 col dim is present the nested builder takes over.
async function mountNestedCols({ dimensions, dragToCols, valueAt }) {
  installCubeMocks({ dimensions });
  runTm1Query.mockImplementation(async (payload) =>
    (payload.cols || []).length > 1
      ? buildNestedColResponse(payload, valueAt)
      : buildQueryResponse(payload),
  );
  const wrapper = mount(PivotExplorer, { attachTo: document.body });
  attachedWrappers.push(wrapper);
  await settle();
  // Drag each requested dim onto the Columns well, in order (outer dims first so
  // the colDims order = declaration order, the band order the envelope reports).
  for (const dim of dragToCols) {
    const dt = makeDataTransfer(dim);
    const colsWell = zone(wrapper, 'cols');
    fireDrag(filterGrip(wrapper, dim).element, 'dragstart', { dataTransfer: dt });
    fireDrag(colsWell.element, 'dragover', { dataTransfer: dt });
    fireDrag(colsWell.element, 'drop', { dataTransfer: dt });
    await settle();
  }
  return wrapper;
}

// The trimmed text of the leaf (innermost) col-head cells, EXCLUDING Total, in
// DOM order — these are the columns the data cells align to.
function leafHeadTexts(wrapper) {
  return wrapper
    .findAll('thead th.pivot-grid__col-head:not(.pivot-grid__total-head)')
    .map((th) => th.text().trim());
}

// The group (outer-band, spanning) cells of a given band <tr> (0 = outermost).
function groupCellsAtLevel(wrapper, level) {
  const bandRows = wrapper.findAll('thead tr.pivot-grid__col-band-row');
  if (level >= bandRows.length) return [];
  return bandRows[level].findAll('th.pivot-grid__col-group');
}

// The data <td> cells of the body row whose row-label === label, EXCLUDING the
// trailing per-row Total cell — i.e. exactly the surviving leaf columns, in order.
function dataCellsOf(wrapper, label) {
  const row = bodyRows(wrapper).find(
    (tr) => tr.find('.pivot-grid__row-label').text() === label,
  );
  if (!row) return [];
  return row
    .findAll('td.pivot-grid__cell:not(.pivot-grid__total-cell)')
    .map((td) => td.text().trim());
}

describe('PivotExplorer — nested columns (tester deep coverage)', () => {
  // ── SEAM 1: suppression × RAGGED spans ──────────────────────────────────────
  // One month (Aug) is all-zero under ONE year (FY25) only; under FY24 both months
  // carry value. With Suppress ON, FY25/Aug drops → FY25 spans 1 while FY24 still
  // spans 2 (a RAGGED band). Totals + cell alignment must recompute over the THREE
  // surviving leaves (FY24/Jul, FY24/Aug, FY25/Jul) — not the four nominal ones.
  it('SEAM 1 — ragged spans: an all-zero month under ONE year shrinks THAT year\'s colspan to 1 while its sibling still spans 2; totals recompute over survivors', async () => {
    // valueAt: FY24 gives Jul=10, Aug=5 (both survive). FY25 gives Jul=20, Aug=0
    // (Aug drops under suppression). EXPENSE only (single non-zero account row keeps
    // the arithmetic legible); COGS contributes 0 everywhere so it suppresses out.
    const VAL = {
      EXPENSE: { 'FY24 Jul': 10, 'FY24 Aug': 5, 'FY25 Jul': 20, 'FY25 Aug': 0 },
    };
    const valueAt = (member, tuple) => VAL[member]?.[tuple.join(' ')] ?? 0;
    const wrapper = await mountNestedCols({
      dimensions: ['account', 'year', 'month', 'measure'],
      dragToCols: ['year'],
      valueAt,
    });
    // Suppress is ON by default — exactly the seam.

    expect(chipMap(wrapper)).toContain('cols:year');
    expect(chipMap(wrapper)).toContain('cols:month');

    // THREE leaves survive (FY24/Jul, FY24/Aug, FY25/Jul); FY25/Aug dropped.
    expect(leafHeadTexts(wrapper)).toEqual(['Jul', 'Aug', 'Jul']);

    // RAGGED outer band: FY24 spans 2, FY25 spans 1 — read the colspans by year.
    const groups = groupCellsAtLevel(wrapper, 0);
    expect(groups.map((th) => th.text().trim())).toEqual(['FY24', 'FY25']);
    const spanByYear = Object.fromEntries(
      groups.map((th) => [th.text().trim(), th.attributes('colspan')]),
    );
    expect(spanByYear.FY24).toBe('2'); // Jul + Aug both survived
    expect(spanByYear.FY25).toBe('1'); // only Jul survived → span SHRANK
    // The total span across the outer band equals the surviving-leaf count (3),
    // so the header band stays rectangular over the body.
    const totalSpan = groups.reduce((s, th) => s + Number(th.attributes('colspan')), 0);
    expect(totalSpan).toBe(leafHeadTexts(wrapper).length);

    // CELL ALIGNMENT over survivors: EXPENSE row cells land under [FY24/Jul=10,
    // FY24/Aug=5, FY25/Jul=20] in that exact surviving order (FY25/Aug is gone).
    expect(dataCellsOf(wrapper, 'EXPENSE')).toEqual(['10', '5', '20']);

    // TOTALS recompute over the survivors: per-column footer = 10, 5, 20 (only
    // EXPENSE contributes); grand total = 35. NOT 35+0 with a phantom Aug column.
    expect(colTotalTexts(wrapper).slice(0, 3)).toEqual(['10', '5', '20']);
    expect(grandTotalText(wrapper)).toBe('35');
  });

  // ── SEAM 2: multi-dim alias ACROSS the band ──────────────────────────────────
  // BOTH year AND month advertise a `name` alias simultaneously; each band LEVEL
  // relabels independently from its OWN dimension's label map, and the principal
  // key stays in the cell :title. Locks architect §1.1 "alias EVERY segment of
  // EVERY col tuple, keyed by that segment's dimension" — not just colDims[0].
  it('SEAM 2 — multi-dim alias: year AND month both relabel independently across the band; principal kept in :title', async () => {
    const YEAR_LABELS = { FY24: 'FY 2024', FY25: 'FY 2025' };
    const MONTH_LABELS = { Jul: 'July', Aug: 'August' };
    installCubeMocks({ dimensions: ['account', 'year', 'month', 'measure'] });
    // year + month BOTH advertise `name`; account too (base default) so it does not
    // matter here. Drive the nested builder once >1 col dim is on the axis.
    getTm1DimensionAliases.mockImplementation(async (dimension) => ({
      dimension,
      aliases: ['year', 'month', 'account'].includes(dimension) ? ['name'] : [],
    }));
    getTm1ElementLabels.mockImplementation(async (dimension, alias, elements) => {
      const MAP = { year: YEAR_LABELS, month: MONTH_LABELS, account: {} };
      const all = MAP[dimension] || {};
      const labels = {};
      for (const m of elements || []) if (all[m] != null) labels[m] = all[m];
      return { dimension, alias, labels };
    });
    // Every leaf non-zero so suppression keeps the full FY24/FY25 × Jul/Aug band.
    runTm1Query.mockImplementation(async (payload) =>
      (payload.cols || []).length > 1
        ? buildNestedColResponse(payload, () => 7)
        : buildQueryResponse(payload),
    );
    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();
    const dt = makeDataTransfer('year');
    const colsWell = zone(wrapper, 'cols');
    fireDrag(filterGrip(wrapper, 'year').element, 'dragstart', { dataTransfer: dt });
    fireDrag(colsWell.element, 'dragover', { dataTransfer: dt });
    fireDrag(colsWell.element, 'drop', { dataTransfer: dt });
    await settle();

    // OUTER band (year): relabelled to FY 2024 / FY 2025 — NOT the raw FY24/FY25.
    const yearGroups = groupCellsAtLevel(wrapper, 0).map((th) => th.text().trim());
    expect(yearGroups).toEqual(['FY 2024', 'FY 2025']);
    expect(yearGroups).not.toContain('FY24');

    // INNER band (month): relabelled to July / August INDEPENDENTLY — proves the
    // alias is per-segment by dimension, not a single colDims[0] relabel.
    expect(leafHeadTexts(wrapper)).toEqual(['July', 'August', 'July', 'August']);

    // PRINCIPAL kept in :title on BOTH band levels (audit affordance).
    const fy24 = groupCellsAtLevel(wrapper, 0).find((th) => th.text().trim() === 'FY 2024');
    expect(fy24.attributes('title')).toBe('FY24');
    const julLeaf = wrapper
      .findAll('thead th.pivot-grid__col-head:not(.pivot-grid__total-head)')
      .find((th) => th.text().trim() === 'July');
    expect(julLeaf.attributes('title')).toBe('Jul');
  });

  // ── SEAM 3: 3-DEEP band (year › month › measure) ─────────────────────────────
  // Corner + Total rowspan=3; TWO group-band rows (year, month) + ONE leaf row
  // (measure); leaf headers present. Locks colBandDepth=3 driving the rowspans and
  // the level→class split (outer two = col-group, innermost = col-head).
  it('SEAM 3 — 3-deep band: corner & Total rowspan=3, two group rows + one leaf row, leaf headers present', async () => {
    // measure dim with TWO members so the innermost band has >1 leaf per month.
    const MEASURE2 = {
      top: 'All_Measure',
      children: { All_Measure: [{ name: 'amount', type: 'N' }, { name: 'growth', type: 'N' }] },
    };
    installCubeMocks({ dimensions: ['account', 'year', 'month', 'measure2'] });
    // Teach the element/children mocks about measure2 (base ELEMENTS/CHILDREN lack
    // it). Auto-default seeds measure2's children when it lands on the col axis.
    const baseElements = getTm1DimensionElements.getMockImplementation();
    getTm1DimensionElements.mockImplementation(async (dimension, hier) =>
      dimension === 'measure2'
        ? { elements: [{ name: 'All_Measure', type: 'C' }, { name: 'amount', type: 'N' }, { name: 'growth', type: 'N' }] }
        : baseElements(dimension, hier),
    );
    const baseChildren = getTm1DimensionChildren.getMockImplementation();
    getTm1DimensionChildren.mockImplementation(async (dimension, parent, hier) =>
      dimension === 'measure2'
        ? { children: MEASURE2.children[parent] || [] }
        : baseChildren(dimension, parent, hier),
    );
    runTm1Query.mockImplementation(async (payload) =>
      (payload.cols || []).length > 1
        ? buildNestedColResponse(payload, () => 3)
        : buildQueryResponse(payload),
    );
    const wrapper = mount(PivotExplorer, { attachTo: document.body });
    attachedWrappers.push(wrapper);
    await settle();
    // Drag year THEN measure2 onto cols → colDims [year, month, measure2]
    // (declaration order: account, year, month, measure2 → month already on cols).
    for (const dim of ['year', 'measure2']) {
      const dt = makeDataTransfer(dim);
      const colsWell = zone(wrapper, 'cols');
      fireDrag(filterGrip(wrapper, dim).element, 'dragstart', { dataTransfer: dt });
      fireDrag(colsWell.element, 'dragover', { dataTransfer: dt });
      fireDrag(colsWell.element, 'drop', { dataTransfer: dt });
      await settle();
    }

    // THREE col dims live on the axis.
    expect(chipMap(wrapper)).toContain('cols:year');
    expect(chipMap(wrapper)).toContain('cols:month');
    expect(chipMap(wrapper)).toContain('cols:measure2');

    // THREE band rows (one per col dim).
    const bandRows = wrapper.findAll('thead tr.pivot-grid__col-band-row');
    expect(bandRows.length).toBe(3);

    // Corner + Total both rowspan the full depth (3), each rendered once.
    const corner = wrapper.findAll('thead th.pivot-grid__corner');
    expect(corner.length).toBe(1);
    expect(corner[0].attributes('rowspan')).toBe('3');
    const totalHead = wrapper.findAll('thead th.pivot-grid__total-head');
    expect(totalHead.length).toBe(1);
    expect(totalHead[0].attributes('rowspan')).toBe('3');

    // TWO group-band rows (year, month) carry ONLY col-group cells; the THIRD row
    // (measure) carries the leaf col-head cells. (The corner + Total head sit on the
    // FIRST band row and rowspan downward — the Total head IS a col-head + total-head,
    // so we EXCLUDE total-head when asserting "no LEAF col-head on the group rows".)
    expect(bandRows[0].findAll('th.pivot-grid__col-group').length).toBeGreaterThan(0);
    expect(bandRows[1].findAll('th.pivot-grid__col-group').length).toBeGreaterThan(0);
    expect(
      bandRows[0].findAll('th.pivot-grid__col-head:not(.pivot-grid__total-head)').length,
    ).toBe(0);
    expect(
      bandRows[1].findAll('th.pivot-grid__col-head:not(.pivot-grid__total-head)').length,
    ).toBe(0);
    // Innermost leaf headers are the measure members, repeated under each month.
    const leaves = leafHeadTexts(wrapper);
    expect(leaves).toContain('amount');
    expect(leaves).toContain('growth');
    // FY24/FY25 × Jul/Aug × {amount,growth} = 8 leaves.
    expect(leaves.length).toBe(8);
    // The year group spans all 4 leaves beneath it (2 months × 2 measures).
    const yearSpans = groupCellsAtLevel(wrapper, 0).map((th) => th.attributes('colspan'));
    expect(yearSpans).toEqual(['4', '4']);
    // Each month group spans its 2 measures.
    groupCellsAtLevel(wrapper, 1).forEach((th) => expect(th.attributes('colspan')).toBe('2'));
  });

  // ── SEAM 4: cell-to-leaf ALIGNMENT under a multi-col crossjoin ────────────────
  // A SPECIFIC row's value lands under the correct [year,month] leaf. This locks
  // the contract that colAxis.tuples ORDER matches rows[r].cells ORDER — the single
  // most load-bearing invariant of the whole feature. We give EXPENSE four DISTINCT
  // values keyed to the four leaves; the rendered cells must read back in leaf order.
  it('SEAM 4 — cell-to-leaf alignment: EXPENSE\'s four distinct values land under FY24/Jul, FY24/Aug, FY25/Jul, FY25/Aug in tuple order', async () => {
    // Distinct, non-zero values per leaf so suppression keeps all four AND any
    // off-by-one or transposed mapping is visible as a wrong number under a header.
    const VAL = {
      EXPENSE: { 'FY24 Jul': 11, 'FY24 Aug': 22, 'FY25 Jul': 33, 'FY25 Aug': 44 },
    };
    const valueAt = (member, tuple) => VAL[member]?.[tuple.join(' ')] ?? 0;
    const wrapper = await mountNestedCols({
      dimensions: ['account', 'year', 'month', 'measure'],
      dragToCols: ['year'],
      valueAt,
    });
    await setSuppress(wrapper, false); // keep ALL FOUR leaves visible.

    // The four leaves render in crossjoin order under their year groups.
    expect(leafHeadTexts(wrapper)).toEqual(['Jul', 'Aug', 'Jul', 'Aug']);
    expect(groupCellsAtLevel(wrapper, 0).map((th) => th.text().trim())).toEqual(['FY24', 'FY25']);

    // THE ALIGNMENT CONTRACT: EXPENSE's cells read back in EXACT leaf-tuple order.
    // 11 under FY24/Jul, 22 under FY24/Aug, 33 under FY25/Jul, 44 under FY25/Aug.
    expect(dataCellsOf(wrapper, 'EXPENSE')).toEqual(['11', '22', '33', '44']);

    // Cross-check the per-column footer totals land under the same leaves (only
    // EXPENSE is non-zero, COGS rolls 0 here) — proving the footer aligns with the
    // header band leaf-for-leaf, not just the body.
    expect(colTotalTexts(wrapper).slice(0, 4)).toEqual(['11', '22', '33', '44']);
  });

  // ── SEAM 5: ENVELOPE-ABSENT fallback ─────────────────────────────────────────
  // A response with ONLY legacy `columns` (no colAxis) must render a FLAT single-row
  // band (one band row, every cell a leaf col-head, no col-group), no crash. Locks
  // normalisePivot's legacy fallback + colBandDepth defaulting to 1.
  it('SEAM 5 — envelope absent: legacy `columns` only (no colAxis) renders a flat single-row band, no crash', async () => {
    installCubeMocks();
    // Strip the colAxis/rowAxis envelope the base builder adds — emulate an OLD
    // backend that returns ONLY the flat legacy shape.
    runTm1Query.mockImplementation(async (payload) => {
      const full = buildQueryResponse(payload);
      return { columns: full.columns, rows: full.rows, mdx: full.mdx }; // NO colAxis
    });
    const wrapper = await mountExplorer();
    await setSuppress(wrapper, false); // show both Jul/Aug legacy columns.

    // Mounted + rendered a grid (no crash) over the legacy shape.
    expect(wrapper.find('table.pivot-grid').exists()).toBe(true);
    expect(rowLabels(wrapper)).toEqual(['EXPENSE', 'COGS']);

    // EXACTLY ONE band row (flat), and it carries NO group (spanning) cells.
    const bandRows = wrapper.findAll('thead tr.pivot-grid__col-band-row');
    expect(bandRows.length).toBe(1);
    expect(wrapper.findAll('thead th.pivot-grid__col-group').length).toBe(0);

    // Every column header is a leaf col-head (the legacy flat contract) — Jul/Aug.
    const leaves = leafHeadTexts(wrapper);
    expect(leaves).toContain('Jul');
    expect(leaves).toContain('Aug');

    // Corner + Total rowspan collapse to 1 (depth=1) — single-row band.
    expect(wrapper.find('thead th.pivot-grid__corner').attributes('rowspan')).toBe('1');
    expect(wrapper.find('thead th.pivot-grid__total-head').attributes('rowspan')).toBe('1');
  });

  // ── SEAM 6: single-col-dim UNCHANGED (the invariant) ─────────────────────────
  // depth=1 → ONE band row, ALL cells .pivot-grid__col-head, ZERO .pivot-grid__
  // col-group. This is the contract the pre-existing suites + the alias logic rely
  // on; the nested feature must NOT regress it for the common single-col case.
  it('SEAM 6 — single col dim: ONE band row, all col-head, NO col-group (the invariant the existing suites rely on)', async () => {
    const wrapper = await mountExplorer(); // base layout: month is the ONLY col dim.
    await setSuppress(wrapper, false);

    // Exactly ONE band row.
    const bandRows = wrapper.findAll('thead tr.pivot-grid__col-band-row');
    expect(bandRows.length).toBe(1);

    // ZERO group cells (no spanning) — the single-col invariant.
    expect(wrapper.findAll('thead th.pivot-grid__col-group').length).toBe(0);

    // The col headers are leaf col-heads (Jul, Aug + the Total head).
    const leaves = leafHeadTexts(wrapper);
    expect(leaves).toEqual(['Jul', 'Aug']);
    // Corner + Total rowspan=1 (band depth 1).
    expect(wrapper.find('thead th.pivot-grid__corner').attributes('rowspan')).toBe('1');
    expect(wrapper.find('thead th.pivot-grid__total-head').attributes('rowspan')).toBe('1');

    // And the leaf cells still align (Jul=100 for EXPENSE, Aug=0) — the legacy
    // single-col cell contract every existing test reads.
    expect(dataCellsOf(wrapper, 'EXPENSE')).toEqual(['100', '0']);
  });
});
